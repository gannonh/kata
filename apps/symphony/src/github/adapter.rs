use std::collections::HashSet;

use async_trait::async_trait;

use crate::domain::{Issue, TrackerConfig};
use crate::error::{Result, SymphonyError};
use crate::github::client::{GithubClient, GithubIssue};
use crate::linear::adapter::TrackerAdapter;

pub struct GithubAdapter {
    pub client: GithubClient,
    pub config: TrackerConfig,
}

impl GithubAdapter {
    pub fn new(client: GithubClient, config: TrackerConfig) -> Self {
        Self { client, config }
    }

    fn state_prefix(&self) -> &str {
        self.config
            .label_prefix
            .as_deref()
            .unwrap_or(self.client.label_prefix.as_str())
    }

    fn issue_to_domain(&self, gh: &GithubIssue) -> Issue {
        let state = extract_state_from_labels(&gh.labels, self.state_prefix())
            .map(|(_, display)| display)
            .unwrap_or_default();

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
            .or_else(|| gh.user.as_ref().map(|u| u.login.clone()));

        Issue {
            id: gh.number.to_string(),
            identifier: format!("#{}", gh.number),
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
            children_count: 0,
            parent_identifier: None,
        }
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
}

#[async_trait]
impl TrackerAdapter for GithubAdapter {
    async fn fetch_candidate_issues(&self) -> Result<Vec<Issue>> {
        let issues = self.client.list_issues("open", &[]).await?;
        let allowed_states = self.candidate_state_set();

        let assignee_filter = self.assignee_filter();

        let filtered = issues
            .iter()
            .filter(|issue| {
                let Some((normalized_state, _)) =
                    extract_state_from_labels(&issue.labels, self.state_prefix())
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

    async fn fetch_issues_by_states(&self, state_names: &[String]) -> Result<Vec<Issue>> {
        // NOTE: We intentionally query only GitHub-open issues.
        // Symphony tracker state is label-driven (`{prefix}:{state}`), and this adapter does not
        // transition GitHub's native open/closed field.
        let issues = self.client.list_issues("open", &[]).await?;
        let state_filters: HashSet<String> = state_names
            .iter()
            .map(|state| normalize_state_for_label(state))
            .collect();

        let filtered = issues
            .iter()
            .filter(|issue| {
                extract_state_from_labels(&issue.labels, self.state_prefix())
                    .map(|(normalized, _)| state_filters.contains(&normalized))
                    .unwrap_or(false)
            })
            .map(|issue| self.issue_to_domain(issue))
            .collect();

        Ok(filtered)
    }

    async fn fetch_issue_states_by_ids(&self, issue_ids: &[String]) -> Result<Vec<Issue>> {
        let mut issues = Vec::new();

        for issue_id in issue_ids {
            let Ok(number) = issue_id.parse::<u64>() else {
                continue;
            };

            match self.client.get_issue(number).await {
                Ok(issue) => issues.push(self.issue_to_domain(&issue)),
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

    async fn create_comment(&self, issue_id: &str, body: &str) -> Result<()> {
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

        let issue = self.client.get_issue(number).await?;
        let prefix = self.state_prefix();

        let old_label = issue.labels.iter().find_map(|label| {
            let lower = label.name.to_ascii_lowercase();
            let marker = format!("{}:", prefix.to_ascii_lowercase());
            if lower.starts_with(&marker) {
                Some(label.name.clone())
            } else {
                None
            }
        });

        let new_label = format!("{prefix}:{}", normalize_state_for_label(state_name));

        tracing::debug!(
            issue_number = number,
            old_label = ?old_label,
            new_label = %new_label,
            "Updating GitHub issue state via label swap"
        );

        if let Some(ref old) = old_label {
            if old != &new_label {
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
        }

        if old_label.as_deref() != Some(new_label.as_str()) {
            self.client.add_label(number, &new_label).await?;
        }

        Ok(())
    }
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
    if issue
        .user
        .as_ref()
        .is_some_and(|user| user.login.eq_ignore_ascii_case(expected))
    {
        return true;
    }

    issue
        .assignees
        .iter()
        .any(|assignee| assignee.login.eq_ignore_ascii_case(expected))
}

fn normalize_state_for_label(state_name: &str) -> String {
    state_name
        .trim()
        .to_ascii_lowercase()
        .replace('_', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

fn denormalize_label_state(normalized: &str) -> String {
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
