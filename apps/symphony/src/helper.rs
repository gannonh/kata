use std::io::Read;
use std::process::{Command, Output, Stdio};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::domain::TrackerConfig;
use crate::error;
use crate::github::adapter::GithubAdapter;
use crate::github::auth::{
    github_token_missing_message, github_token_source_name, resolve_github_token,
};
use crate::github::client::{GithubClient, GithubIssueComment};
use crate::linear::adapter::{LinearAdapter, TrackerAdapter};
use crate::linear::client::{LinearClient, LinearCommentRecord};

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

const GH_SUBPROCESS_TIMEOUT: Duration = Duration::from_secs(30);

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

#[derive(Debug)]
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
    command.env("GH_PROMPT_DISABLED", "1");
    command
}

fn run_gh_output(args: &[String], token: &str) -> Result<Output, String> {
    let mut command = Command::new("gh");
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = github_helper_token_env(command, token)
        .spawn()
        .map_err(|err| format!("failed to run gh {}: {err}", args.join(" ")))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut stdout = Vec::new();
                if let Some(mut pipe) = child.stdout.take() {
                    let _ = pipe.read_to_end(&mut stdout);
                }
                let mut stderr = Vec::new();
                if let Some(mut pipe) = child.stderr.take() {
                    let _ = pipe.read_to_end(&mut stderr);
                }
                return Ok(Output {
                    status,
                    stdout,
                    stderr,
                });
            }
            Ok(None) => {
                if started.elapsed() >= GH_SUBPROCESS_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "gh {} timed out after {}s",
                        args.join(" "),
                        GH_SUBPROCESS_TIMEOUT.as_secs()
                    ));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(err) => {
                return Err(format!("gh {} failed while waiting: {err}", args.join(" ")));
            }
        }
    }
}

fn run_gh_json(args: &[String], token: &str) -> Result<Value, String> {
    let output = run_gh_output(args, token)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() && stdout.is_empty() {
        return Err(format!(
            "gh {} failed: {}",
            args.join(" "),
            command_output_text(&output)
        ));
    }
    serde_json::from_str(&stdout).map_err(|err| {
        if !output.status.success() {
            return format!(
                "gh {} failed: {}",
                args.join(" "),
                command_output_text(&output)
            );
        }
        format!(
            "failed to parse gh {} JSON output: {err}; output={}",
            args.join(" "),
            stdout
        )
    })
}

fn run_gh_text(args: &[String], token: &str) -> Result<String, String> {
    let output = run_gh_output(args, token)?;
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

fn github_comment_record(comment: &GithubIssueComment) -> Value {
    serde_json::json!({
        "id": comment.id.to_string(),
        "body": comment.body.clone(),
        "url": comment.html_url.clone(),
        "created_at": comment.created_at.clone(),
        "updated_at": comment.updated_at.clone(),
    })
}

fn linear_comment_record(comment: &LinearCommentRecord) -> Value {
    serde_json::json!({
        "id": comment.id.clone(),
        "body": comment.body.clone(),
        "url": comment.url.clone(),
        "created_at": comment.created_at.clone(),
        "updated_at": comment.updated_at.clone(),
    })
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
    let pr_arg = pr.as_deref().map(parse_github_pr_number).transpose()?;
    let include_logs = helper_bool(&input, "includeLogs", false);
    let max_lines = helper_usize(&input, "maxLines", 160);

    let mut args = vec!["pr".to_string(), "checks".to_string()];
    if let Some(pr_arg) = pr_arg {
        args.push(pr_arg.to_string());
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
        args.push(parse_github_pr_number(&pr)?.to_string());
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
            .iter()
            .map(github_comment_record)
            .collect()
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
            Ok(serde_json::json!({ "comment": github_comment_record(&comment) }))
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
            Ok(serde_json::json!({ "title": title, "comment": github_comment_record(&comment) }))
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
    let client = LinearClient::new(tracker.clone());
    let adapter = LinearAdapter::new(client.clone());
    match operation {
        "issue.get" => {
            let issue_id = issue_id(&input, "issueId")?;
            let detail = adapter
                .fetch_helper_issue(
                    &issue_id,
                    helper_bool(&input, "includeChildren", true),
                    helper_bool(&input, "includeComments", true),
                )
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({
                "issue": detail.issue,
                "children": detail.children,
                "comments": detail.comments,
            }))
        }
        "issue.list-children" => {
            let issue_id = issue_id(&input, "issueId")?;
            let detail = adapter
                .fetch_helper_issue(&issue_id, true, false)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "children": detail.children }))
        }
        "comment.upsert" => {
            let issue_id = issue_id(&input, "issueId")?;
            let body = required_str(&input, "body")?;
            let marker = optional_str(&input, "marker");
            let comment = adapter
                .upsert_comment(&issue_id, marker.as_deref(), &body)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "comment": linear_comment_record(&comment) }))
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
        "issue.create-followup" => {
            let title = required_str(&input, "title")?;
            let description = required_str(&input, "description")?;
            let parent_issue_id = optional_issue_id(&input, "parentIssueId")?.ok_or_else(|| {
                "helper input field `parentIssueId` must be provided for Linear follow-up creation"
                    .to_string()
            })?;
            let issue = adapter
                .create_followup_issue(&parent_issue_id, &title, &description)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "issue": issue }))
        }
        "document.read" => {
            let issue_id = issue_id(&input, "issueId")?;
            let documents: Vec<Value> = client
                .list_comments(&issue_id)
                .await
                .map_err(|err| err.to_string())?
                .into_iter()
                .filter_map(|comment| {
                    let (title, content) = parse_symphony_document_comment(&comment.body)?;
                    Some(serde_json::json!({
                        "title": title,
                        "content": content,
                        "comment": linear_comment_record(&comment),
                    }))
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
            let issue_id = issue_id(&input, "issueId")?;
            let title = required_str(&input, "title")?;
            let content = required_str(&input, "content")?;
            let marker = symphony_document_marker(&title);
            let body = format!("{marker}\n\n{content}");
            let comment = adapter
                .upsert_comment(&issue_id, Some(&marker), &body)
                .await
                .map_err(|err| err.to_string())?;
            Ok(serde_json::json!({ "title": title, "comment": linear_comment_record(&comment) }))
        }
        "pr.inspect-checks" | "pr.inspect-feedback" | "pr.land-status" => Err(format!(
            "operation `{operation}` is only available when tracker.kind is github"
        )),
        other => Err(format!("unsupported Symphony helper operation: {other}")),
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
    use crate::domain::ApiKey;
    use mockito::{Matcher, Server};
    use serde_json::json;

    fn github_config(endpoint: String) -> TrackerConfig {
        TrackerConfig {
            kind: Some("github".to_string()),
            endpoint,
            api_key: Some(ApiKey::new("test-token")),
            repo_owner: Some("kata-sh".to_string()),
            repo_name: Some("kata-mono".to_string()),
            label_prefix: Some("symphony".to_string()),
            active_states: vec!["Todo".to_string(), "In Progress".to_string()],
            terminal_states: vec!["Done".to_string()],
            ..TrackerConfig::default()
        }
    }

    fn github_issue(number: u64, labels: &[&str]) -> Value {
        json!({
            "number": number,
            "title": format!("Issue {number}"),
            "body": format!("Body {number}"),
            "state": "open",
            "user": { "login": "alice" },
            "assignee": { "login": "alice" },
            "assignees": [{ "login": "alice" }],
            "labels": labels.iter().map(|name| json!({
                "name": name,
                "color": "ffffff",
                "description": null
            })).collect::<Vec<_>>(),
            "created_at": "2026-03-29T10:00:00Z",
            "updated_at": "2026-03-29T10:30:00Z",
            "html_url": format!("https://github.com/kata-sh/kata-mono/issues/{number}"),
            "sub_issues_summary": { "total": 0, "completed": 0, "percent_completed": 0 }
        })
    }

    fn github_comment(id: u64, body: &str) -> Value {
        json!({
            "id": id,
            "body": body,
            "html_url": format!("https://github.com/kata-sh/kata-mono/issues/7#issuecomment-{id}"),
            "created_at": "2026-03-29T10:00:00Z",
            "updated_at": "2026-03-29T10:30:00Z"
        })
    }

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

    #[test]
    fn helper_input_and_scalar_parsers_cover_validation_paths() {
        let dir = tempfile::tempdir().expect("tempdir");
        let valid_path = dir.path().join("input.json");
        std::fs::write(
            &valid_path,
            r#"{" issueId ":" kept ","flag":true,"count":3}"#,
        )
        .expect("write valid input");
        let invalid_path = dir.path().join("invalid.json");
        std::fs::write(&invalid_path, "[1,2,3]").expect("write invalid input");

        assert_eq!(
            read_helper_input(None).expect("empty input defaults"),
            json!({})
        );
        assert!(read_helper_input(valid_path.to_str()).is_ok());
        assert!(read_helper_input(invalid_path.to_str()).is_err());

        let input = json!({
            "issueId": "  #12  ",
            "empty": "   ",
            "flag": false,
            "count": 7
        });
        assert_eq!(required_str(&input, "issueId").expect("issue id"), "#12");
        assert_eq!(optional_str(&input, "empty"), None);
        assert!(!helper_bool(&input, "flag", true));
        assert!(helper_bool(&input, "missing", true));
        assert_eq!(helper_usize(&input, "count", 3), 7);
        assert_eq!(helper_usize(&json!({"count": "many"}), "count", 3), 3);
        assert_eq!(normalize_github_issue_id("#12"), "12");
        assert_eq!(normalize_github_issue_id("KAT-12"), "KAT-12");
        assert_eq!(parse_github_issue_number("#12").expect("issue number"), 12);
        assert!(parse_github_issue_number("abc").is_err());
        assert_eq!(
            parse_github_pr_number("https://github.com/kata-sh/kata-mono/pull/531")
                .expect("pr url"),
            531
        );
        assert_eq!(parse_github_pr_number("#531").expect("pr number"), 531);
        assert!(parse_github_pr_number("nope").is_err());
        assert_eq!(
            resolve_issue_id_value(
                "@current".to_string(),
                "issueId",
                Some("7".to_string()),
                None
            )
            .expect("current id"),
            "7"
        );
        assert!(resolve_issue_id_value("@current".to_string(), "issueId", None, None).is_err());
        assert_eq!(
            symphony_document_marker(" Plan "),
            "<!-- symphony:document:Plan -->"
        );
        assert!(parse_symphony_document_comment("plain text").is_none());
        assert!(parse_symphony_document_comment("<!-- symphony:document: -->body").is_none());
        assert_eq!(tail_lines("a\nb\nc", 2), "b\nc");
        assert_eq!(
            extract_github_actions_run_id("https://github.com/o/r/actions/runs/123/jobs/456")
                .as_deref(),
            Some("123")
        );
        assert!(extract_github_actions_run_id("https://example.com").is_none());
        assert!(gh_check_is_failing(&json!({"state":"failure"})));
        assert!(gh_check_is_failing(&json!({"conclusion":"cancelled"})));
        assert!(gh_check_is_failing(&json!({"bucket":"fail"})));
        assert!(!gh_check_is_failing(&json!({"state":"success"})));
        assert_eq!(
            gh_check_url(&json!({"detailsUrl":"https://example.com"})),
            Some("https://example.com")
        );
        assert_eq!(
            gh_check_url(&json!({"link":"https://example.com/link"})),
            Some("https://example.com/link")
        );
    }

    #[test]
    fn github_adapter_inputs_validate_required_config() {
        let mut config = github_config("".to_string());
        let inputs = github_adapter_inputs(&config).expect("github inputs");
        assert_eq!(inputs.token, "test-token");
        assert_eq!(inputs.repo_owner, "kata-sh");
        assert_eq!(inputs.repo_name, "kata-mono");
        assert_eq!(inputs.label_prefix, "symphony");
        assert_eq!(inputs.endpoint, "https://api.github.com");

        config.repo_owner = Some(" ".to_string());
        let err = github_adapter_inputs(&config).expect_err("missing owner");
        assert!(err
            .to_string()
            .contains("tracker.repo_owner is required when tracker.kind is github"));
    }

    #[tokio::test]
    async fn github_issue_get_reads_issue_children_and_comments() {
        let mut server = Server::new_async().await;
        let config = github_config(server.url());

        let issue_mock = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(github_issue(7, &["symphony:todo"]).to_string())
            .expect(1)
            .create_async()
            .await;
        let children_mock = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/sub_issues")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!([github_issue(8, &["symphony:todo"])]).to_string())
            .expect(1)
            .create_async()
            .await;
        let child_issue_mock = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/8")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(github_issue(8, &["symphony:todo"]).to_string())
            .expect(1)
            .create_async()
            .await;
        let comments_mock = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_query(Matcher::UrlEncoded("per_page".into(), "100".into()))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!([github_comment(91, "hello")]).to_string())
            .expect(1)
            .create_async()
            .await;

        let result = run_operation(&config, "issue.get", json!({ "issueId": "#7" }))
            .await
            .expect("github issue.get");

        issue_mock.assert_async().await;
        children_mock.assert_async().await;
        child_issue_mock.assert_async().await;
        comments_mock.assert_async().await;
        assert_eq!(result["issue"]["id"], "7");
        assert_eq!(result["children"][0]["id"], "8");
        assert_eq!(result["comments"][0]["body"], "hello");
    }

    #[tokio::test]
    async fn github_comment_and_document_helpers_route_through_comments() {
        let mut server = Server::new_async().await;
        let config = github_config(server.url());

        let list_for_update = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_query(Matcher::UrlEncoded("per_page".into(), "100".into()))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!([github_comment(91, "<!-- marker -->\n\nold")]).to_string())
            .expect(1)
            .create_async()
            .await;
        let update_comment = server
            .mock("PATCH", "/repos/kata-sh/kata-mono/issues/comments/91")
            .match_body(Matcher::PartialJson(json!({
                "body": "<!-- marker -->\n\nnew"
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(github_comment(91, "<!-- marker -->\n\nnew").to_string())
            .expect(1)
            .create_async()
            .await;

        let updated = run_operation(
            &config,
            "comment.upsert",
            json!({
                "issueId": "7",
                "marker": "<!-- marker -->",
                "body": "new"
            }),
        )
        .await
        .expect("comment upsert");
        assert_eq!(updated["comment"]["id"], "91");
        assert_eq!(
            updated["comment"]["url"],
            "https://github.com/kata-sh/kata-mono/issues/7#issuecomment-91"
        );

        let document_body = "<!-- symphony:document:Plan -->\n\nStep 1";
        let list_for_read = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_query(Matcher::UrlEncoded("per_page".into(), "100".into()))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(json!([github_comment(92, document_body)]).to_string())
            .expect(1)
            .create_async()
            .await;

        let read = run_operation(
            &config,
            "document.read",
            json!({ "issueId": "7", "title": "Plan" }),
        )
        .await
        .expect("document read");
        assert_eq!(read["content"], "Step 1");

        let list_for_write = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_query(Matcher::UrlEncoded("per_page".into(), "100".into()))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("[]")
            .expect(1)
            .create_async()
            .await;
        let create_document = server
            .mock("POST", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_body(Matcher::PartialJson(json!({
                "body": "<!-- symphony:document:Plan -->\n\nNext"
            })))
            .with_status(201)
            .with_header("content-type", "application/json")
            .with_body(github_comment(93, "<!-- symphony:document:Plan -->\n\nNext").to_string())
            .expect(1)
            .create_async()
            .await;

        let written = run_operation(
            &config,
            "document.write",
            json!({ "issueId": "7", "title": "Plan", "content": "Next" }),
        )
        .await
        .expect("document write");
        assert_eq!(written["title"], "Plan");

        list_for_update.assert_async().await;
        update_comment.assert_async().await;
        list_for_read.assert_async().await;
        list_for_write.assert_async().await;
        create_document.assert_async().await;
    }

    #[tokio::test]
    async fn github_followup_and_state_helpers_mutate_expected_endpoints() {
        let mut server = Server::new_async().await;
        let config = github_config(server.url());

        let create_issue = server
            .mock("POST", "/repos/kata-sh/kata-mono/issues")
            .match_body(Matcher::PartialJson(json!({
                "title": "Follow-up",
                "body": "Details"
            })))
            .with_status(201)
            .with_header("content-type", "application/json")
            .with_body(github_issue(42, &["symphony:todo"]).to_string())
            .expect(1)
            .create_async()
            .await;
        let list_parent_comments = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_query(Matcher::UrlEncoded("per_page".into(), "100".into()))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("[]")
            .expect(1)
            .create_async()
            .await;
        let create_parent_comment = server
            .mock("POST", "/repos/kata-sh/kata-mono/issues/7/comments")
            .match_body(Matcher::Regex("symphony:followup:42".to_string()))
            .with_status(201)
            .with_header("content-type", "application/json")
            .with_body(github_comment(94, "follow-up").to_string())
            .expect(1)
            .create_async()
            .await;

        let followup = run_operation(
            &config,
            "issue.create-followup",
            json!({
                "parentIssueId": "#7",
                "title": "Follow-up",
                "description": "Details"
            }),
        )
        .await
        .expect("create followup");
        assert_eq!(followup["issue"]["number"], 42);

        let get_issue = server
            .mock("GET", "/repos/kata-sh/kata-mono/issues/7")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(github_issue(7, &["symphony:todo", "bug"]).to_string())
            .expect(1)
            .create_async()
            .await;
        let remove_label = server
            .mock(
                "DELETE",
                "/repos/kata-sh/kata-mono/issues/7/labels/symphony:todo",
            )
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("{}")
            .expect(1)
            .create_async()
            .await;
        let add_label = server
            .mock("POST", "/repos/kata-sh/kata-mono/issues/7/labels")
            .match_body(Matcher::PartialJson(json!({
                "labels": ["symphony:in-progress"]
            })))
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body("[]")
            .expect(1)
            .create_async()
            .await;

        let state = run_operation(
            &config,
            "issue.update-state",
            json!({ "issueId": "#7", "state": "In Progress" }),
        )
        .await
        .expect("update state");
        assert_eq!(state["issueId"], "7");
        assert_eq!(state["state"], "In Progress");

        create_issue.assert_async().await;
        list_parent_comments.assert_async().await;
        create_parent_comment.assert_async().await;
        get_issue.assert_async().await;
        remove_label.assert_async().await;
        add_label.assert_async().await;
    }

    #[tokio::test]
    async fn helper_routing_reports_backend_specific_errors() {
        let github = github_config("http://127.0.0.1:1".to_string());
        let err = run_operation(&github, "unknown.operation", json!({}))
            .await
            .expect_err("unsupported github helper");
        assert!(err.contains("unsupported Symphony helper operation"));

        let linear = TrackerConfig {
            kind: Some("linear".to_string()),
            endpoint: "http://127.0.0.1:1/graphql".to_string(),
            api_key: Some(ApiKey::new("linear-token")),
            ..TrackerConfig::default()
        };
        let err = run_operation(&linear, "pr.inspect-feedback", json!({}))
            .await
            .expect_err("github-only helper on linear");
        assert!(err.contains("only available when tracker.kind is github"));
        let err = run_operation(&linear, "issue.create-followup", json!({}))
            .await
            .expect_err("missing linear parent");
        assert!(err.contains("title"));
    }
}
