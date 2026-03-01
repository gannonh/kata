use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceStatus {
    Ready,
    Creating,
    Error,
    Archived,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceSourceType {
    Local,
    Github,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub source_type: WorkspaceSourceType,
    pub source: String,
    pub repo_root_path: String,
    pub worktree_path: String,
    pub branch: String,
    pub base_ref: Option<String>,
    pub status: WorkspaceStatus,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalWorkspaceInput {
    pub repo_path: String,
    pub workspace_name: String,
    pub branch_name: Option<String>,
    pub base_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGitHubWorkspaceInput {
    pub repo_url: String,
    pub workspace_name: String,
    pub clone_root_path: Option<String>,
    pub branch_name: Option<String>,
    pub base_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNewGitHubWorkspaceInput {
    pub repository_name: String,
    pub workspace_name: String,
    pub clone_root_path: Option<String>,
    pub branch_name: Option<String>,
    pub base_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownRepoOption {
    pub id: String,
    pub name_with_owner: String,
    pub url: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceBranchOption {
    pub name: String,
    pub is_default: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePullRequestOption {
    pub number: u32,
    pub title: String,
    pub head_branch: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceIssueOption {
    pub number: u32,
    pub title: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkspaceCreateFromSource {
    Default,
    PullRequest { value: u32 },
    Branch { value: String },
    Issue { value: u32 },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceFromSourceInput {
    pub repo_id: String,
    pub workspace_name: Option<String>,
    pub clone_root_path: Option<String>,
    pub source: WorkspaceCreateFromSource,
}

#[derive(Debug, Clone)]
pub struct PreparedWorkspace {
    pub repo_root_path: String,
    pub worktree_path: String,
    pub branch: String,
    pub base_ref: String,
}

pub fn now_iso8601() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn slugify_name(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut prev_dash = false;

    for ch in value.chars() {
        let normalized = ch.to_ascii_lowercase();
        if normalized.is_ascii_alphanumeric() {
            slug.push(normalized);
            prev_dash = false;
        } else if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "workspace".to_string()
    } else {
        trimmed
    }
}

pub fn derive_workspace_branch_name(name: &str, suffix: &str) -> String {
    format!("workspace/{}-{}", slugify_name(name), suffix)
}
