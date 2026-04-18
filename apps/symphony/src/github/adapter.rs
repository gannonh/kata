use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use tokio::sync::OnceCell;

use crate::domain::{
    canonical_kata_phase_name, parse_kata_identifier, Issue, TrackerConfig, KATA_PHASE_NAMES,
};
use crate::error::{Result, SymphonyError};
use crate::github::client::{GithubClient, GithubIssue};
use crate::github::projects_v2::{ProjectsV2Client, StatusFieldInfo, StatusOption};
use crate::linear::adapter::TrackerAdapter;

#[derive(Debug, Clone)]
pub enum StateMode {
    ProjectsV2 {
        project_number: u64,
        v2_client: ProjectsV2Client,
    },
    Labels,
}

impl std::fmt::Display for StateMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProjectsV2 { project_number, .. } => {
                write!(f, "projects_v2(project_number={project_number})")
            }
            Self::Labels => write!(f, "labels"),
        }
    }
}

pub struct GithubAdapter {
    pub client: GithubClient,
    pub config: TrackerConfig,
    pub state_mode: StateMode,
    status_field_cache: OnceCell<StatusFieldInfo>,
}

impl GithubAdapter {
    pub fn new(client: GithubClient, config: TrackerConfig) -> Self {
        let state_mode = match config.github_project_number {
            Some(project_number) => StateMode::ProjectsV2 {
                project_number,
                v2_client: ProjectsV2Client::new(client.clone()),
            },
            None => StateMode::Labels,
        };

        Self::emit_state_vocabulary_diagnostics(&config);

        tracing::info!(state_mode = %state_mode, "GithubAdapter initialized");

        Self {
            client,
            config,
            state_mode,
            status_field_cache: OnceCell::new(),
        }
    }

    pub fn state_mode(&self) -> &StateMode {
        &self.state_mode
    }

    fn emit_state_vocabulary_diagnostics(config: &TrackerConfig) {
        for configured_state in &config.active_states {
            if canonical_kata_phase_name(configured_state).is_none() {
                tracing::warn!(
                    event = "symphony_state_vocabulary_check",
                    field = "active_states",
                    configured_state = %configured_state,
                    canonical_phases = ?KATA_PHASE_NAMES,
                    "configured GitHub active state is outside canonical Kata phase vocabulary"
                );
                tracing::info!(
                    event = "symphony_state_normalization_fallback",
                    configured_state = %configured_state,
                    "falling back to generic state normalization for non-canonical state"
                );
            }
        }

        for configured_state in &config.terminal_states {
            if canonical_kata_phase_name(configured_state).is_none() {
                tracing::info!(
                    event = "symphony_state_vocabulary_check",
                    field = "terminal_states",
                    configured_state = %configured_state,
                    canonical_phases = ?KATA_PHASE_NAMES,
                    "configured GitHub terminal state is non-canonical but allowed"
                );
            }
        }
    }

    fn state_prefix(&self) -> String {
        let raw = self
            .config
            .label_prefix
            .as_deref()
            .unwrap_or(self.client.label_prefix.as_str());
        normalize_label_prefix(raw)
    }

    fn issue_to_domain_with_state(&self, gh: &GithubIssue, state_override: Option<&str>) -> Issue {
        let state_prefix = self.state_prefix();
        let state = state_override
            .map(normalize_state_for_display)
            .unwrap_or_else(|| {
                extract_state_from_labels(&gh.labels, &state_prefix)
                    .map(|(_, display)| display)
                    .unwrap_or_default()
            });

        let labels = gh.labels.iter().map(|label| label.name.clone()).collect();
        let url = gh.html_url.clone().or_else(|| {
            Some(format!(
                "https://github.com/{}/{}/issues/{}",
                self.client.repo_owner, self.client.repo_name, gh.number
            ))
        });

        let assignee_id = gh
            .assignees
            .first()
            .map(|assignee| assignee.login.clone())
            .or_else(|| gh.assignee.as_ref().map(|assignee| assignee.login.clone()));

        let identifier = if let Some(kata_identifier) = parse_kata_identifier(&gh.title) {
            tracing::debug!(
                event = "kata_identifier_parsed",
                issue_number = gh.number,
                kata_identifier = %kata_identifier,
                "parsed kata identifier from GitHub issue title"
            );
            format!("{kata_identifier}#{}", gh.number)
        } else {
            format!("#{}", gh.number)
        };

        let parent_identifier = gh
            .parent_issue_url
            .as_deref()
            .and_then(parse_issue_number_from_url)
            .map(|number| format!("#{number}"));

        let children_count = gh
            .sub_issues_summary
            .as_ref()
            .map(|summary| summary.total)
            .unwrap_or(0);

        Issue {
            id: gh.number.to_string(),
            identifier,
            title: gh.title.clone(),
            description: gh.body.clone(),
            priority: None,
            state,
            branch_name: None,
            url,
            assignee_id,
            labels,
            blocked_by: vec![],
            assigned_to_worker: self.assigned_to_worker(gh),
            created_at: gh.created_at,
            updated_at: gh.updated_at,
            children_count,
            parent_identifier,
        }
    }

    fn issue_to_domain(&self, gh: &GithubIssue) -> Issue {
        self.issue_to_domain_with_state(gh, None)
    }

    fn candidate_state_set(&self) -> HashSet<String> {
        self.config
            .active_states
            .iter()
            .map(|state| normalize_state_for_label(state))
            .collect()
    }

    fn assignee_filter(&self) -> Option<String> {
        self.config
            .assignee
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_ascii_lowercase())
    }

    fn assigned_to_worker(&self, issue: &GithubIssue) -> bool {
        let Some(assignee) = self.assignee_filter() else {
            return true;
        };

        issue_matches_assignee(issue, &assignee)
    }

    fn projects_mode(&self) -> Option<(u64, &ProjectsV2Client)> {
        match &self.state_mode {
            StateMode::ProjectsV2 {
                project_number,
                v2_client,
            } => Some((*project_number, v2_client)),
            StateMode::Labels => None,
        }
    }

    async fn ensure_status_field(&self) -> Result<&StatusFieldInfo> {
        let (project_number, v2_client) = self.projects_mode().ok_or_else(|| {
            SymphonyError::GithubProjectsV2Error(
                "Projects v2 mode not enabled for this GitHub adapter".to_string(),
            )
        })?;

        let owner = self.client.repo_owner.clone();
        self.status_field_cache
            .get_or_try_init(|| async {
                v2_client.resolve_status_field(&owner, project_number).await
            })
            .await
    }

    fn status_option_ids_for_names(
        &self,
        status_field: &StatusFieldInfo,
        state_names: &[String],
    ) -> Result<Vec<String>> {
        let mut option_ids = Vec::new();
        let mut seen = HashSet::new();

        for state_name in state_names {
            let normalized = normalize_state_for_compare(state_name);
            let option = status_field
                .options
                .iter()
                .find(|option| normalize_state_for_compare(&option.name) == normalized)
                .ok_or_else(|| {
                    let available = status_field
                        .options
                        .iter()
                        .map(|option| option.name.clone())
                        .collect::<Vec<_>>()
                        .join(", ");
                    SymphonyError::GithubProjectsV2Error(format!(
                        "status option '{state_name}' not found; available: [{available}]"
                    ))
                })?;

            if seen.insert(option.id.clone()) {
                option_ids.push(option.id.clone());
            }
        }

        Ok(option_ids)
    }

    fn status_option_for_name<'a>(
        &self,
        status_field: &'a StatusFieldInfo,
        state_name: &str,
    ) -> Result<&'a StatusOption> {
        let normalized = normalize_state_for_compare(state_name);
        status_field
            .options
            .iter()
            .find(|option| normalize_state_for_compare(&option.name) == normalized)
            .ok_or_else(|| {
                let available = status_field
                    .options
                    .iter()
                    .map(|option| option.name.clone())
                    .collect::<Vec<_>>()
                    .join(", ");
                SymphonyError::GithubProjectsV2Error(format!(
                    "status option '{state_name}' not found on project; available: [{available}]"
                ))
            })
    }

    async fn fetch_candidate_issues_labels(&self) -> Result<Vec<Issue>> {
        let issues = self.client.list_issues("open", &[]).await?;
        let allowed_states = self.candidate_state_set();
        let assignee_filter = self.assignee_filter();
        let state_prefix = self.state_prefix();

        let filtered = issues
            .iter()
            .filter(|issue| {
                if issue.pull_request.is_some() {
                    tracing::debug!(
                        issue_number = issue.number,
                        "Skipping GitHub pull request from candidate issue set"
                    );
                    return false;
                }

                let Some((normalized_state, _)) =
                    extract_state_from_labels(&issue.labels, &state_prefix)
                else {
                    tracing::warn!(
                        issue_number = issue.number,
                        labels = ?issue.labels.iter().map(|l| l.name.clone()).collect::<Vec<_>>(),
                        "GitHub issue missing state label"
                    );
                    return false;
                };

                if !allowed_states.contains(&normalized_state) {
                    return false;
                }

                if let Some(assignee) = assignee_filter.as_deref() {
                    return issue_matches_assignee(issue, assignee);
                }

                true
            })
            .map(|issue| self.issue_to_domain(issue))
            .collect();

        Ok(filtered)
    }

    async fn fetch_candidate_issues_projects(
        &self,
        v2_client: &ProjectsV2Client,
    ) -> Result<Vec<Issue>> {
        let status_field = self.ensure_status_field().await?;
        let option_ids =
            self.status_option_ids_for_names(status_field, &self.config.active_states)?;
        if option_ids.is_empty() {
            return Ok(Vec::new());
        }

        let project_items = v2_client
            .query_items_by_status(&status_field.project_id, &option_ids)
            .await?;

        let assignee_filter = self.assignee_filter();
        let mut issues = Vec::new();

        for item in project_items {
            let issue = match self.client.get_issue(item.issue_number).await {
                Ok(issue) => issue,
                Err(SymphonyError::GithubApiStatus { status: 404, .. }) => {
                    tracing::debug!(
                        issue_number = item.issue_number,
                        "GitHub issue missing while reading Projects v2 candidate"
                    );
                    continue;
                }
                Err(err) => return Err(err),
            };

            if issue.pull_request.is_some() {
                tracing::debug!(
                    issue_number = issue.number,
                    "Skipping GitHub pull request from Projects v2 candidate issue set"
                );
                continue;
            }

            if !issue.state.eq_ignore_ascii_case("open") {
                tracing::debug!(
                    issue_number = issue.number,
                    issue_state = %issue.state,
                    "Skipping non-open GitHub issue from Projects v2 candidate issue set"
                );
                continue;
            }

            if let Some(assignee) = assignee_filter.as_deref() {
                if !issue_matches_assignee(&issue, assignee) {
                    continue;
                }
            }

            let issue_state = item.status.as_deref().unwrap_or_default();
            issues.push(self.issue_to_domain_with_state(&issue, Some(issue_state)));
        }

        Ok(issues)
    }

    async fn fetch_issues_by_states_labels(&self, state_names: &[String]) -> Result<Vec<Issue>> {
        // NOTE: We intentionally query only GitHub-open issues.
        // Symphony tracker state is label-driven (`{prefix}:{state}`), and this adapter does not
        // transition GitHub's native open/closed field.
        let issues = self.client.list_issues("open", &[]).await?;
        let state_filters: HashSet<String> = state_names
            .iter()
            .map(|state| normalize_state_for_label(state))
            .collect();
        let state_prefix = self.state_prefix();

        let filtered = issues
            .iter()
            .filter(|issue| {
                if issue.pull_request.is_some() {
                    tracing::debug!(
                        issue_number = issue.number,
                        "Skipping GitHub pull request while filtering by state"
                    );
                    return false;
                }

                extract_state_from_labels(&issue.labels, &state_prefix)
                    .map(|(normalized, _)| state_filters.contains(&normalized))
                    .unwrap_or(false)
            })
            .map(|issue| self.issue_to_domain(issue))
            .collect();

        Ok(filtered)
    }

    async fn fetch_issues_by_states_projects(
        &self,
        v2_client: &ProjectsV2Client,
        state_names: &[String],
    ) -> Result<Vec<Issue>> {
        let status_field = self.ensure_status_field().await?;
        let option_ids = self.status_option_ids_for_names(status_field, state_names)?;
        if option_ids.is_empty() {
            return Ok(Vec::new());
        }

        let project_items = v2_client
            .query_items_by_status(&status_field.project_id, &option_ids)
            .await?;

        let mut issues = Vec::new();

        for item in project_items {
            let issue = match self.client.get_issue(item.issue_number).await {
                Ok(issue) => issue,
                Err(SymphonyError::GithubApiStatus { status: 404, .. }) => {
                    tracing::debug!(
                        issue_number = item.issue_number,
                        "GitHub issue missing while reading Projects v2 state filter"
                    );
                    continue;
                }
                Err(err) => return Err(err),
            };

            if issue.pull_request.is_some() {
                tracing::debug!(
                    issue_number = issue.number,
                    "Skipping GitHub pull request while filtering by Projects v2 state"
                );
                continue;
            }

            let issue_state = item.status.as_deref().unwrap_or_default();
            issues.push(self.issue_to_domain_with_state(&issue, Some(issue_state)));
        }

        Ok(issues)
    }

    async fn fetch_issue_states_by_ids_labels(&self, issue_ids: &[String]) -> Result<Vec<Issue>> {
        let mut issues = Vec::new();

        for issue_id in issue_ids {
            let Ok(number) = issue_id.parse::<u64>() else {
                continue;
            };

            match self.client.get_issue(number).await {
                Ok(issue) => {
                    if issue.pull_request.is_some() {
                        tracing::debug!(
                            issue_number = number,
                            "Skipping GitHub pull request while fetching issue states"
                        );
                        continue;
                    }

                    issues.push(self.issue_to_domain(&issue));
                }
                Err(SymphonyError::GithubApiStatus { status: 404, .. }) => {
                    tracing::debug!(
                        issue_number = number,
                        "GitHub issue not found while polling"
                    );
                }
                Err(err) => return Err(err),
            }
        }

        Ok(issues)
    }

    async fn fetch_issue_states_by_ids_projects(
        &self,
        v2_client: &ProjectsV2Client,
        issue_ids: &[String],
    ) -> Result<Vec<Issue>> {
        let status_field = self.ensure_status_field().await?;

        let no_filter: Vec<String> = Vec::new();
        let project_items = v2_client
            .query_items_by_status(&status_field.project_id, &no_filter)
            .await?;

        let mut state_by_issue_number = HashMap::new();
        for item in project_items {
            if let Some(status) = item.status {
                state_by_issue_number.insert(item.issue_number, status);
            }
        }

        let mut issues = Vec::new();
        for issue_id in issue_ids {
            let Ok(number) = issue_id.parse::<u64>() else {
                continue;
            };

            let Some(state) = state_by_issue_number.get(&number).cloned() else {
                tracing::debug!(
                    issue_number = number,
                    "GitHub issue not on project board while fetching issue states"
                );
                continue;
            };

            match self.client.get_issue(number).await {
                Ok(issue) => {
                    if issue.pull_request.is_some() {
                        tracing::debug!(
                            issue_number = number,
                            "Skipping GitHub pull request while fetching Projects v2 issue states"
                        );
                        continue;
                    }

                    issues.push(self.issue_to_domain_with_state(&issue, Some(&state)));
                }
                Err(SymphonyError::GithubApiStatus { status: 404, .. }) => {
                    tracing::debug!(
                        issue_number = number,
                        "GitHub issue not found while polling Projects v2 state"
                    );
                }
                Err(err) => return Err(err),
            }
        }

        Ok(issues)
    }

    async fn update_issue_state_projects(
        &self,
        v2_client: &ProjectsV2Client,
        issue_number: u64,
        state_name: &str,
    ) -> Result<()> {
        let project_number = self
            .projects_mode()
            .map(|(project_number, _)| project_number)
            .ok_or_else(|| {
                SymphonyError::GithubProjectsV2Error(
                    "Projects v2 mode not enabled for this GitHub adapter".to_string(),
                )
            })?;

        let status_field = self.ensure_status_field().await?;
        let target_option = match self.status_option_for_name(status_field, state_name) {
            Ok(option) => option,
            Err(err) => {
                tracing::warn!(
                    event = "github_projects_v2_status_option_missing",
                    issue_number,
                    attempted_state = %state_name,
                    error = %err,
                    "Projects v2 status option not found for requested state transition"
                );
                return Err(err);
            }
        };

        let no_filter: Vec<String> = Vec::new();
        let project_items = v2_client
            .query_items_by_status(&status_field.project_id, &no_filter)
            .await?;

        let project_item = project_items
            .into_iter()
            .find(|item| item.issue_number == issue_number)
            .ok_or_else(|| {
                SymphonyError::GithubProjectsV2Error(format!(
                    "issue #{issue_number} is not on project board #{project_number}"
                ))
            })?;

        tracing::debug!(
            issue_number,
            item_id = %project_item.item_id,
            "resolved project item for issue"
        );

        tracing::debug!(
            issue_number,
            project_number,
            option_id = %target_option.id,
            state_name,
            "updating Projects v2 status"
        );

        v2_client
            .update_item_status(
                &status_field.project_id,
                &project_item.item_id,
                &status_field.field_id,
                &target_option.id,
            )
            .await
    }
}

#[async_trait]
impl TrackerAdapter for GithubAdapter {
    async fn fetch_candidate_issues(&self) -> Result<Vec<Issue>> {
        match self.projects_mode() {
            Some((_, v2_client)) => self.fetch_candidate_issues_projects(v2_client).await,
            None => self.fetch_candidate_issues_labels().await,
        }
    }

    async fn fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>> {
        match self.projects_mode() {
            Some((_, v2_client)) => {
                self.fetch_issues_by_states_projects(v2_client, state_names)
                    .await
            }
            None => self.fetch_issues_by_states_labels(state_names).await,
        }
    }

    async fn fetch_issue_states_by_ids(&self, issue_ids: &[String]) -> Result<Vec<Issue>> {
        match self.projects_mode() {
            Some((_, v2_client)) => {
                self.fetch_issue_states_by_ids_projects(v2_client, issue_ids)
                    .await
            }
            None => self.fetch_issue_states_by_ids_labels(issue_ids).await,
        }
    }

    async fn create_comment(&self, issue_id: &str, body: &str) -> Result<()> {
        // Intentionally mode-independent: comments always use GitHub REST issue comments.
        let number = issue_id.parse::<u64>().map_err(|err| {
            SymphonyError::Other(format!(
                "invalid GitHub issue id '{issue_id}' for create_comment: {err}"
            ))
        })?;

        self.client.create_comment(number, body).await
    }

    async fn update_issue_state(&self, issue_id: &str, state_name: &str) -> Result<()> {
        let number = issue_id.parse::<u64>().map_err(|err| {
            SymphonyError::Other(format!(
                "invalid GitHub issue id '{issue_id}' for update_issue_state: {err}"
            ))
        })?;

        match self.projects_mode() {
            Some((_, v2_client)) => {
                self.update_issue_state_projects(v2_client, number, state_name)
                    .await
            }
            None => {
                let issue = self.client.get_issue(number).await?;
                let prefix = self.state_prefix();

                let marker = format!("{}:", prefix.to_ascii_lowercase());
                let old_labels: Vec<String> = issue
                    .labels
                    .iter()
                    .filter_map(|label| {
                        if label.name.to_ascii_lowercase().starts_with(&marker) {
                            Some(label.name.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                let new_label = format!("{prefix}:{}", normalize_state_for_label(state_name));

                tracing::debug!(
                    issue_number = number,
                    old_labels = ?old_labels,
                    new_label = %new_label,
                    "Updating GitHub issue state via label swap"
                );

                for old in old_labels
                    .iter()
                    .filter(|old| old.as_str() != new_label.as_str())
                {
                    match self.client.remove_label(number, old).await {
                        Ok(()) => {}
                        Err(SymphonyError::GithubApiStatus { status: 404, .. }) => {
                            tracing::debug!(
                                issue_number = number,
                                old_label = %old,
                                "Old GitHub state label already absent"
                            );
                        }
                        Err(err) => return Err(err),
                    }
                }

                if !old_labels.iter().any(|label| label == &new_label) {
                    self.client.add_label(number, &new_label).await?;
                }

                Ok(())
            }
        }
    }
}

fn normalize_label_prefix(prefix: &str) -> String {
    prefix.trim().trim_end_matches(':').to_string()
}

fn parse_issue_number_from_url(url: &str) -> Option<u64> {
    let segment = url.trim().trim_end_matches('/').rsplit('/').next()?;
    segment.parse::<u64>().ok()
}

fn extract_state_from_labels(
    labels: &[crate::github::client::GithubLabel],
    prefix: &str,
) -> Option<(String, String)> {
    let marker = format!("{}:", prefix.to_ascii_lowercase());

    labels.iter().find_map(|label| {
        let lower = label.name.to_ascii_lowercase();
        if !lower.starts_with(&marker) {
            return None;
        }

        let raw_state = label.name.split_once(':')?.1.trim();
        if raw_state.is_empty() {
            return None;
        }

        let normalized = normalize_state_for_label(raw_state);
        Some((normalized.clone(), denormalize_label_state(&normalized)))
    })
}

fn issue_matches_assignee(issue: &GithubIssue, expected: &str) -> bool {
    issue
        .assignees
        .iter()
        .any(|assignee| assignee.login.eq_ignore_ascii_case(expected))
        || issue
            .assignee
            .as_ref()
            .is_some_and(|assignee| assignee.login.eq_ignore_ascii_case(expected))
}

fn normalize_state_for_label(state_name: &str) -> String {
    if let Some(canonical) = canonical_kata_phase_name(state_name) {
        return canonical.to_ascii_lowercase().replace(' ', "-");
    }

    state_name
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

fn normalize_state_for_compare(state_name: &str) -> String {
    let normalized = canonical_kata_phase_name(state_name).unwrap_or(state_name);

    normalized
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn normalize_state_for_display(state_name: &str) -> String {
    canonical_kata_phase_name(state_name)
        .map(ToString::to_string)
        .unwrap_or_else(|| denormalize_label_state(&normalize_state_for_label(state_name)))
}

fn denormalize_label_state(normalized: &str) -> String {
    if let Some(canonical) = canonical_kata_phase_name(normalized) {
        return canonical.to_string();
    }

    let compare = normalize_state_for_compare(normalized);
    if let Some(canonical) = KATA_PHASE_NAMES
        .iter()
        .copied()
        .find(|phase| normalize_state_for_compare(phase) == compare)
    {
        return canonical.to_string();
    }

    tracing::info!(
        event = "symphony_state_normalization_fallback",
        normalized_state = %normalized,
        "using generic label state denormalization for non-canonical state"
    );

    normalized
        .split('-')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}
