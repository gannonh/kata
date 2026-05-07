use std::process::Command;

use serde_json::Value;

use crate::domain::TrackerConfig;
use crate::error;
use crate::github::adapter::GithubAdapter;
use crate::github::auth::{
    github_token_missing_message, github_token_source_name, resolve_github_token,
};
use crate::github::client::{GithubClient, GithubIssueComment};
use crate::linear::adapter::{LinearAdapter, TrackerAdapter};
use crate::linear::client::LinearClient;

pub const SHARED_HELPER_OPERATIONS: &[&str] = &[
    "issue.get",
    "issue.list-children",
    "comment.upsert",
    "issue.update-state",
    "issue.create-followup",
    "document.read",
    "document.write",
];

pub const GITHUB_ONLY_HELPER_OPERATIONS: &[&str] =
    &["pr.inspect-feedback", "pr.inspect-checks", "pr.land-status"];

pub fn success_envelope(data: Value) -> Value {
    serde_json::json!({ "ok": true, "data": data })
}

pub fn error_envelope(message: impl Into<String>) -> Value {
    serde_json::json!({
        "ok": false,
        "error": {
            "code": "HELPER_ERROR",
            "message": message.into(),
        },
    })
}

pub fn read_helper_input(input_path: Option<&str>) -> Result<Value, String> {
    let Some(input_path) = input_path else {
        return Ok(serde_json::json!({}));
    };
    let raw = std::fs::read_to_string(input_path)
        .map_err(|err| format!("failed to read helper input {input_path}: {err}"))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("helper input must be valid JSON object: {err}"))
        .and_then(|value: Value| {
            if value.is_object() {
                Ok(value)
            } else {
                Err("helper input must be a JSON object".to_string())
            }
        })
}

pub fn required_str(input: &Value, field: &str) -> Result<String, String> {
    input
        .get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("helper input field `{field}` must be a non-empty string"))
}

pub fn optional_str(input: &Value, field: &str) -> Option<String> {
    input
        .get(field)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn current_issue_id() -> Option<String> {
    std::env::var("SYMPHONY_ISSUE_ID")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn current_issue_identifier() -> Option<String> {
    std::env::var("SYMPHONY_ISSUE_IDENTIFIER")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn resolve_issue_id_value(
    raw: String,
    field: &str,
    current_id: Option<String>,
    current_identifier: Option<String>,
) -> Result<String, String> {
    if raw == "@current" {
        return current_id.ok_or_else(|| {
            format!("helper input field `{field}` used @current, but SYMPHONY_ISSUE_ID is not set")
        });
    }

    if let (Some(current_id), Some(current_identifier)) = (current_id, current_identifier) {
        if raw == current_identifier {
            return Ok(current_id);
        }
    }

    Ok(raw)
}

fn issue_id_value(raw: String, field: &str) -> Result<String, String> {
    resolve_issue_id_value(raw, field, current_issue_id(), current_issue_identifier())
}

fn issue_id(input: &Value, field: &str) -> Result<String, String> {
    issue_id_value(required_str(input, field)?, field)
}

fn optional_issue_id(input: &Value, field: &str) -> Result<Option<String>, String> {
    optional_str(input, field)
        .map(|value| issue_id_value(value, field))
        .transpose()
}

fn normalize_github_issue_id(issue_id: &str) -> String {
    let trimmed = issue_id.trim();
    if let Some(number) = trimmed.strip_prefix('#') {
        if !number.is_empty() && number.chars().all(|ch| ch.is_ascii_digit()) {
            return number.to_string();
        }
    }
    trimmed.to_string()
}

pub fn parse_symphony_document_comment(body: &str) -> Option<(String, String)> {
    let rest = body.strip_prefix("<!-- symphony:document:")?;
    let (title, content) = rest.split_once("-->")?;
    let title = title.trim();
    if title.is_empty() {
        return None;
    }
    Some((title.to_string(), content.trim_start().to_string()))
}

pub fn symphony_document_marker(title: &str) -> String {
    format!("<!-- symphony:document:{} -->", title.trim())
}

fn helper_bool(input: &Value, field: &str, default: bool) -> bool {
    input
        .get(field)
        .and_then(|value| value.as_bool())
        .unwrap_or(default)
}

pub struct GithubAdapterInputs {
    pub token: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub label_prefix: String,
    pub endpoint: String,
}

pub fn github_adapter_inputs(tracker: &TrackerConfig) -> error::Result<GithubAdapterInputs> {
    let resolved = resolve_github_token(tracker).ok_or_else(|| {
        error::SymphonyError::InvalidWorkflowConfig(github_token_missing_message().to_string())
    })?;
    let token_source = resolved.source;
    let token = resolved.token;

    let repo_owner = tracker
        .repo_owner
        .clone()
        .map(|owner| owner.trim().to_string())
        .filter(|owner| !owner.is_empty())
        .ok_or_else(|| {
            error::SymphonyError::InvalidWorkflowConfig(
                "tracker.repo_owner is required when tracker.kind is github".to_string(),
            )
        })?;

    let repo_name = tracker
        .repo_name
        .clone()
        .map(|repo| repo.trim().to_string())
        .filter(|repo| !repo.is_empty())
        .ok_or_else(|| {
            error::SymphonyError::InvalidWorkflowConfig(
                "tracker.repo_name is required when tracker.kind is github".to_string(),
            )
        })?;

    let label_prefix = tracker
        .label_prefix
        .clone()
        .map(|prefix| prefix.trim().to_string())
        .filter(|prefix| !prefix.is_empty())
        .unwrap_or_else(|| "symphony".to_string());

    let endpoint = tracker.endpoint.trim();
    let endpoint = if endpoint.is_empty() {
        "https://api.github.com".to_string()
    } else {
        endpoint.to_string()
    };

    tracing::debug!(
        token_source = github_token_source_name(token_source),
        "resolved GitHub tracker token source"
    );

    Ok(GithubAdapterInputs {
        token,
        repo_owner,
        repo_name,
        label_prefix,
        endpoint,
    })
}

fn github_adapter_from_tracker(tracker: &TrackerConfig) -> error::Result<GithubAdapter> {
    let inputs = github_adapter_inputs(tracker)?;
    let client = GithubClient::with_base_url(
        inputs.token,
        inputs.repo_owner,
        inputs.repo_name,
        inputs.label_prefix,
        inputs.endpoint.as_str(),
    );
    Ok(GithubAdapter::new(client, tracker.clone()))
}

fn parse_github_issue_number(issue_id: &str) -> Result<u64, String> {
    normalize_github_issue_id(issue_id)
        .parse::<u64>()
        .map_err(|err| format!("invalid GitHub issue id `{issue_id}`: {err}"))
}

fn command_output_text(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    [stderr, stdout]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn github_helper_token_env(mut command: Command, token: &str) -> Command {
    command.env("GH_TOKEN", token);
    command.env("GITHUB_TOKEN", token);
    command
}

fn run_gh_json(args: &[String], token: &str) -> Result<Value, String> {
    let mut command = Command::new("gh");
    command.args(args);
    let output = github_helper_token_env(command, token)
        .output()
        .map_err(|err| format!("failed to run gh {}: {err}", args.join(" ")))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() && stdout.is_empty() {
        return Err(format!(
            "gh {} failed: {}",
            args.join(" "),
            command_output_text(&output)
        ));
    }
    serde_json::from_str(&stdout).map_err(|err| {
        format!(
            "failed to parse gh {} JSON output: {err}; output={}",
            args.join(" "),
            stdout
        )
    })
}

fn run_gh_text(args: &[String], token: &str) -> Result<String, String> {
    let mut command = Command::new("gh");
    command.args(args);
    let output = github_helper_token_env(command, token)
        .output()
        .map_err(|err| format!("failed to run gh {}: {err}", args.join(" ")))?;
    if !output.status.success() {
        return Err(format!(
            "gh {} failed: {}",
            args.join(" "),
            command_output_text(&output)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn gh_check_is_failing(check: &Value) -> bool {
    fn field(check: &Value, name: &str) -> String {
        check
            .get(name)
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
    }

    matches!(
        field(check, "state").as_str(),
        "failure" | "error" | "cancelled" | "timed_out" | "action_required"
    ) || matches!(
        field(check, "conclusion").as_str(),
        "failure" | "cancelled" | "timed_out" | "action_required"
    ) || field(check, "bucket") == "fail"
}

fn extract_github_actions_run_id(url: &str) -> Option<String> {
    let marker = "/actions/runs/";
    let start = url.find(marker)? + marker.len();
    let run_id: String = url[start..]
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect();
    if run_id.is_empty() {
        None
    } else {
        Some(run_id)
    }
}

fn tail_lines(text: &str, max_lines: usize) -> String {
    let lines = text.lines().collect::<Vec<_>>();
    let start = lines.len().saturating_sub(max_lines.max(1));
    lines[start..].join("\n")
}

fn gh_check_url(check: &Value) -> Option<&str> {
    check
        .get("detailsUrl")
        .or_else(|| check.get("link"))
        .and_then(|value| value.as_str())
}

fn helper_usize(input: &Value, field: &str, default: usize) -> usize {
    input
        .get(field)
        .and_then(|value| value.as_u64())
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(default)
}

fn github_pr_checks_payload(tracker: &TrackerConfig, input: Value) -> Result<Value, String> {
    let inputs = github_adapter_inputs(tracker).map_err(|err| err.to_string())?;
    let pr = optional_str(&input, "pr").or_else(|| optional_str(&input, "pullRequest"));
    let include_logs = helper_bool(&input, "includeLogs", false);
    let max_lines = helper_usize(&input, "maxLines", 160);

    let mut args = vec!["pr".to_string(), "checks".to_string()];
    if let Some(pr) = pr.as_deref() {
        args.push(pr.to_string());
    }
    args.extend([
        "--json".to_string(),
        "name,state,bucket,link,startedAt,completedAt,workflow".to_string(),
    ]);

    let checks_value = run_gh_json(&args, &inputs.token)?;
    let checks = checks_value
        .as_array()
        .cloned()
        .ok_or_else(|| "gh pr checks returned unexpected JSON shape".to_string())?;

    let mut failing = Vec::new();
    for mut check in checks
        .iter()
        .filter(|check| gh_check_is_failing(check))
        .cloned()
    {
        if include_logs {
            if let Some(run_id) = gh_check_url(&check).and_then(extract_github_actions_run_id) {
                let log_args = vec![
                    "run".to_string(),
                    "view".to_string(),
                    run_id.clone(),
                    "--log".to_string(),
                ];
                match run_gh_text(&log_args, &inputs.token) {
                    Ok(log) => {
                        check["runId"] = Value::String(run_id);
                        check["logTail"] = Value::String(tail_lines(&log, max_lines));
                    }
                    Err(err) => {
                        check["runId"] = Value::String(run_id);
                        check["logError"] = Value::String(err);
                    }
                }
            }
        }
        failing.push(check);
    }

    Ok(serde_json::json!({
        "pr": pr,
        "checks": checks,
        "failing": failing,
        "failingCount": failing.len(),
        "okToProceed": failing.is_empty(),
    }))
}

fn parse_github_pr_number(pr: &str) -> Result<u64, String> {
    let trimmed = pr.trim();
    if let Some((_, number)) = trimmed.rsplit_once("/pull/") {
        return number
            .trim_matches('/')
            .parse::<u64>()
            .map_err(|err| format!("invalid GitHub PR URL `{pr}`: {err}"));
    }
    normalize_github_issue_id(trimmed)
        .parse::<u64>()
        .map_err(|err| format!("invalid GitHub PR value `{pr}`: {err}"))
}

fn github_pr_number_from_input(input: &Value, token: &str) -> Result<u64, String> {
    if let Some(pr) = optional_str(input, "pr").or_else(|| optional_str(input, "pullRequest")) {
        return parse_github_pr_number(&pr);
    }
    let value = run_gh_json(
        &[
            "pr".to_string(),
            "view".to_string(),
            "--json".to_string(),
            "number".to_string(),
        ],
        token,
    )?;
    value
        .get("number")
        .and_then(|value| value.as_u64())
        .ok_or_else(|| "gh pr view did not return a PR number".to_string())
}

async fn github_get_paginated_array(
    client: &GithubClient,
    path: &str,
) -> Result<Vec<Value>, String> {
    let mut page = 1;
    let mut items = Vec::new();
    loop {
        let delimiter = if path.contains('?') { '&' } else { '?' };
        let page_path = format!("{path}{delimiter}per_page=100&page={page}");
        let response = client
            .request(reqwest::Method::GET, &page_path, None)
            .await
            .map_err(|err| err.to_string())?;
        let batch = response
            .json::<Vec<Value>>()
            .await
            .map_err(|err| format!("failed to decode GitHub REST response: {err}"))?;
        if batch.is_empty() {
            break;
        }
        let batch_len = batch.len();
        items.extend(batch);
        if batch_len < 100 {
            break;
        }
        page += 1;
    }
    Ok(items)
}

async fn github_pr_feedback_payload(
    adapter: &GithubAdapter,
    tracker: &TrackerConfig,
    input: Value,
) -> Result<Value, String> {
    let inputs = github_adapter_inputs(tracker).map_err(|err| err.to_string())?;
    let pr_number = github_pr_number_from_input(&input, &inputs.token)?;
    let owner = &adapter.client.repo_owner;
    let repo = &adapter.client.repo_name;
    let issue_comments = github_get_paginated_array(
        &adapter.client,
        &format!("/repos/{owner}/{repo}/issues/{pr_number}/comments"),
    )
    .await?;
    let reviews = github_get_paginated_array(
        &adapter.client,
        &format!("/repos/{owner}/{repo}/pulls/{pr_number}/reviews"),
    )
    .await?;
    let review_comments = github_get_paginated_array(
        &adapter.client,
        &format!("/repos/{owner}/{repo}/pulls/{pr_number}/comments"),
    )
    .await?;

    Ok(serde_json::json!({
        "pullRequest": {
            "number": pr_number,
            "owner": owner,
            "repo": repo,
            "url": format!("https://github.com/{owner}/{repo}/pull/{pr_number}"),
        },
        "conversationComments": issue_comments,
        "reviews": reviews,
        "reviewComments": review_comments,
    }))
}

fn github_pr_view_payload(input: &Value, token: &str) -> Result<Value, String> {
    let mut args = vec!["pr".to_string(), "view".to_string()];
    if let Some(pr) = optional_str(input, "pr").or_else(|| optional_str(input, "pullRequest")) {
        args.push(pr);
    }
    args.extend([
        "--json".to_string(),
        "number,url,title,body,state,headRefName,baseRefName,headRefOid,mergeable,mergeStateStatus,reviewDecision".to_string(),
    ]);
    run_gh_json(&args, token)
}

async fn github_pr_land_status_payload(
    adapter: &GithubAdapter,
    tracker: &TrackerConfig,
    input: Value,
) -> Result<Value, String> {
    let inputs = github_adapter_inputs(tracker).map_err(|err| err.to_string())?;
    let pr = github_pr_view_payload(&input, &inputs.token)?;
    let checks = github_pr_checks_payload(tracker, input.clone())?;
    let feedback = github_pr_feedback_payload(adapter, tracker, input).await?;

    Ok(serde_json::json!({
        "pullRequest": pr,
        "checks": checks,
        "feedback": feedback,
    }))
}

async fn github_issue_payload(
    adapter: &GithubAdapter,
    issue_id: &str,
    include_children: bool,
    include_comments: bool,
) -> Result<Value, String> {
    let issue_id = normalize_github_issue_id(issue_id);
    let issue_ids = vec![issue_id.clone()];
    let issue = adapter
        .fetch_issue_states_by_ids(&issue_ids)
        .await
        .map_err(|err| err.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("issue not found: {issue_id}"))?;

    let number = parse_github_issue_number(&issue.id)?;
    let children = if include_children {
        let child_numbers: Vec<String> = adapter
            .client
            .list_sub_issues(number)
            .await
            .map_err(|err| err.to_string())?
            .into_iter()
            .map(|issue| issue.number.to_string())
            .collect();
        if child_numbers.is_empty() {
            Vec::new()
        } else {
            adapter
                .fetch_issue_states_by_ids(&child_numbers)
                .await
                .map_err(|err| err.to_string())?
        }
    } else {
        Vec::new()
    };

    let comments = if include_comments {
        adapter
            .client
            .list_comments(number)
            .await
            .map_err(|err| err.to_string())?
    } else {
        Vec::new()
    };

    Ok(serde_json::json!({
        "issue": issue,
        "children": children,
        "comments": comments,
    }))
}

async fn github_upsert_comment(
    adapter: &GithubAdapter,
    issue_id: &str,
    marker: Option<&str>,
    body: &str,
) -> Result<GithubIssueComment, String> {
    let issue_id = normalize_github_issue_id(issue_id);
    let number = parse_github_issue_number(&issue_id)?;
    let marker = marker.map(str::trim).filter(|value| !value.is_empty());
    let body = match marker {
        Some(marker) if !body.contains(marker) => format!("{marker}\n\n{body}"),
        _ => body.to_string(),
    };

    let existing = match marker {
        Some(marker) => adapter
            .client
            .list_comments(number)
            .await
            .map_err(|err| err.to_string())?
            .into_iter()
            .find(|comment| {
                comment
                    .body
                    .as_deref()
                    .is_some_and(|body| body.contains(marker))
            }),
        None => None,
    };

    match existing {
        Some(comment) => adapter
            .client
            .update_comment(comment.id, &body)
            .await
            .map_err(|err| err.to_string()),
        None => adapter
            .client
            .create_comment_record(number, &body)
            .await
            .map_err(|err| err.to_string()),
    }
}

async fn run_github_helper(
    tracker: &TrackerConfig,
    operation: &str,
    input: Value,
) -> Result<Value, String> {
    let adapter = github_adapter_from_tracker(tracker).map_err(|err| err.to_string())?;

    match operation {
        "issue.get" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            github_issue_payload(
                &adapter,
                &issue_id,
                helper_bool(&input, "includeChildren", true),
                helper_bool(&input, "includeComments", true),
            )
            .await
        }
        "issue.list-children" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            let number = parse_github_issue_number(&issue_id)?;
            let child_ids: Vec<String> = adapter
                .client
                .list_sub_issues(number)
                .await
                .map_err(|err| err.to_string())?
                .into_iter()
                .map(|issue| issue.number.to_string())
                .collect();
            let children = if child_ids.is_empty() {
                Vec::new()
            } else {
                adapter
                    .fetch_issue_states_by_ids(&child_ids)
                    .await
                    .map_err(|err| err.to_string())?
            };
            Ok(serde_json::json!({ "children": children }))
        }
        "comment.upsert" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            let body = required_str(&input, "body")?;
            let marker = optional_str(&input, "marker");
            let comment =
                github_upsert_comment(&adapter, &issue_id, marker.as_deref(), &body).await?;
            Ok(serde_json::json!({ "comment": comment }))
        }
        "issue.update-state" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            let state = required_str(&input, "state")?;
            adapter
                .update_issue_state(&issue_id, &state)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "state": state }))
        }
        "issue.create-followup" => {
            let title = required_str(&input, "title")?;
            let description = required_str(&input, "description")?;
            let parent_issue_id = optional_issue_id(&input, "parentIssueId")?
                .map(|issue_id| normalize_github_issue_id(&issue_id));
            let issue = adapter
                .client
                .create_issue(&title, &description)
                .await
                .map_err(|err| err.to_string())?;
            if let Some(parent_issue_id) = parent_issue_id {
                let body = format!(
                    "Follow-up issue created: {}",
                    issue
                        .html_url
                        .clone()
                        .unwrap_or_else(|| format!("#{}", issue.number))
                );
                let _ = github_upsert_comment(
                    &adapter,
                    &parent_issue_id,
                    Some(&format!("<!-- symphony:followup:{} -->", issue.number)),
                    &body,
                )
                .await?;
            }
            Ok(serde_json::json!({ "issue": issue }))
        }
        "document.read" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            let number = parse_github_issue_number(&issue_id)?;
            let documents: Vec<Value> = adapter
                .client
                .list_comments(number)
                .await
                .map_err(|err| err.to_string())?
                .into_iter()
                .filter_map(|comment| {
                    let body = comment.body?;
                    let (title, content) = parse_symphony_document_comment(&body)?;
                    Some(serde_json::json!({ "title": title, "content": content }))
                })
                .collect();

            if let Some(title) = optional_str(&input, "title") {
                let content = documents
                    .iter()
                    .find(|document| {
                        document
                            .get("title")
                            .and_then(|value| value.as_str())
                            .is_some_and(|candidate| candidate == title)
                    })
                    .and_then(|document| document.get("content"))
                    .cloned();
                Ok(serde_json::json!({ "title": title, "content": content }))
            } else {
                Ok(serde_json::json!({ "documents": documents }))
            }
        }
        "document.write" => {
            let issue_id = normalize_github_issue_id(&issue_id(&input, "issueId")?);
            let title = required_str(&input, "title")?;
            let content = required_str(&input, "content")?;
            let marker = symphony_document_marker(&title);
            let body = format!("{marker}\n\n{content}");
            let comment = github_upsert_comment(&adapter, &issue_id, Some(&marker), &body).await?;
            Ok(serde_json::json!({ "title": title, "comment": comment }))
        }
        "pr.inspect-checks" => github_pr_checks_payload(tracker, input),
        "pr.inspect-feedback" => github_pr_feedback_payload(&adapter, tracker, input).await,
        "pr.land-status" => github_pr_land_status_payload(&adapter, tracker, input).await,
        other => Err(format!("unsupported Symphony helper operation: {other}")),
    }
}

async fn run_linear_helper(
    tracker: &TrackerConfig,
    operation: &str,
    input: Value,
) -> Result<Value, String> {
    let adapter = LinearAdapter::new(LinearClient::new(tracker.clone()));
    match operation {
        "issue.get" => {
            let issue_id = issue_id(&input, "issueId")?;
            let issues = adapter
                .fetch_issue_states_by_ids(std::slice::from_ref(&issue_id))
                .await
                .map_err(|err| err.to_string())?;
            let issue = issues
                .into_iter()
                .next()
                .ok_or_else(|| format!("issue not found: {issue_id}"))?;
            Ok(serde_json::json!({ "issue": issue, "children": [], "comments": [] }))
        }
        "comment.upsert" => {
            let issue_id = issue_id(&input, "issueId")?;
            let body = required_str(&input, "body")?;
            adapter
                .create_comment(&issue_id, &body)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "upserted": false, "created": true }))
        }
        "issue.update-state" => {
            let issue_id = issue_id(&input, "issueId")?;
            let state = required_str(&input, "state")?;
            adapter
                .update_issue_state(&issue_id, &state)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issueId": issue_id, "state": state }))
        }
        "issue.list-children" => Ok(serde_json::json!({ "children": [] })),
        "pr.inspect-checks" | "pr.inspect-feedback" | "pr.land-status" => Err(format!(
            "operation `{operation}` is only available when tracker.kind is github"
        )),
        other => Err(format!(
            "operation `{other}` is not supported for Linear-backed Symphony helpers yet"
        )),
    }
}

pub async fn run_operation(
    tracker: &TrackerConfig,
    operation: &str,
    input: Value,
) -> Result<Value, String> {
    let tracker_kind = tracker.kind.as_deref().unwrap_or("linear");
    if tracker_kind == "github" {
        run_github_helper(tracker, operation, input).await
    } else {
        run_linear_helper(tracker, operation, input).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn document_comment_parser_reads_title_and_content() {
        let parsed = parse_symphony_document_comment(
            "<!-- symphony:document:Context -->\n\n# Context\n\nDetails",
        )
        .expect("document marker parses");

        assert_eq!(parsed.0, "Context");
        assert_eq!(parsed.1, "# Context\n\nDetails");
    }

    #[test]
    fn current_identifier_rewrites_to_current_issue_id() {
        let result = resolve_issue_id_value(
            "KAT-123".to_string(),
            "issueId",
            Some("linear-uuid".to_string()),
            Some("KAT-123".to_string()),
        )
        .expect("identifier resolves");

        assert_eq!(result, "linear-uuid");
    }
}
