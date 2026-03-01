use std::fs;
use std::path::Path;
use std::process::Command;

use serde::Serialize;
use tauri::State;
use uuid::Uuid;

use super::git_github::{
    create_github_workspace, create_new_github_workspace, list_repo_branches,
    list_repo_issues, list_repo_pull_requests, pull_request_head_branch,
    repo_default_branch,
    repo_url_from_id,
};
use super::git_local::create_local_workspace;
use super::model::{
    now_iso8601, CreateGitHubWorkspaceInput, CreateLocalWorkspaceInput,
    CreateNewGitHubWorkspaceInput, CreateWorkspaceFromSourceInput, KnownRepoOption,
    PreparedWorkspace, Workspace, WorkspaceCreateFromSource, WorkspaceSourceType,
    WorkspaceStatus,
};
use super::{WorkspaceError, WorkspaceState};

fn to_command_error(error: WorkspaceError) -> String {
    error.to_string()
}

fn next_workspace_id() -> String {
    format!("ws_{}", Uuid::new_v4().simple())
}

fn workspace_suffix(workspace_id: &str) -> &str {
    workspace_id
        .strip_prefix("ws_")
        .map(|value| &value[..4.min(value.len())])
        .unwrap_or("ws")
}

fn build_workspace(
    id: String,
    name: String,
    source_type: WorkspaceSourceType,
    source: String,
    prepared: PreparedWorkspace,
) -> Workspace {
    let timestamp = now_iso8601();
    Workspace {
        id,
        name,
        source_type,
        source,
        repo_root_path: prepared.repo_root_path,
        worktree_path: prepared.worktree_path,
        branch: prepared.branch,
        base_ref: Some(prepared.base_ref),
        status: WorkspaceStatus::Ready,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        last_opened_at: None,
    }
}

fn lock_store(state: &WorkspaceState) -> Result<std::sync::MutexGuard<'_, super::WorkspaceStore>, String> {
    state.store.lock().map_err(|_| {
        "Workspace state is unavailable. Please restart the application.".to_string()
    })
}

fn persist_workspace(state: &WorkspaceState, workspace: Workspace) -> Result<Workspace, String> {
    let mut store = lock_store(state)?;
    store.insert(workspace.clone());
    store.set_active(&workspace.id).map_err(to_command_error)?;
    store.save().map_err(to_command_error)?;
    Ok(workspace)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRepoOption {
    pub name_with_owner: String,
    pub url: String,
    pub is_private: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubRepoListItem {
    name_with_owner: String,
    url: String,
    is_private: bool,
    updated_at: Option<String>,
}

fn normalize_search_tokens(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|token| token.trim().to_lowercase())
        .filter(|token| !token.is_empty())
        .collect()
}

fn repo_match_score(repo: &GitHubRepoOption, query_tokens: &[String]) -> i32 {
    if query_tokens.is_empty() {
        return 1;
    }

    let name = repo.name_with_owner.to_lowercase();
    let url = repo.url.to_lowercase();
    let joined = format!("{name} {url}");

    if !query_tokens.iter().all(|token| joined.contains(token)) {
        return 0;
    }

    let mut score = 10;
    for token in query_tokens {
        if name == *token || url == *token {
            score += 150;
        } else if name.starts_with(token) {
            score += 80;
        } else if url.starts_with(token) {
            score += 60;
        } else if name.contains(token) {
            score += 30;
        } else if url.contains(token) {
            score += 20;
        }
    }
    score
}

#[tauri::command]
pub async fn workspace_list_github_repos(
    query: Option<String>,
) -> Result<Vec<GitHubRepoOption>, String> {
    tauri::async_runtime::spawn_blocking(move || workspace_list_github_repos_blocking(query))
        .await
        .map_err(|err| format!("Failed to load GitHub repositories: {err}"))?
}

fn workspace_list_github_repos_blocking(
    query: Option<String>,
) -> Result<Vec<GitHubRepoOption>, String> {
    let output = Command::new("gh")
        .args([
            "repo",
            "list",
            "--limit",
            "200",
            "--source",
            "--no-archived",
            "--json",
            "nameWithOwner,url,isPrivate,updatedAt",
        ])
        .output()
        .map_err(|err| {
            if err.kind() == std::io::ErrorKind::NotFound {
                "GitHub CLI not found. Install gh and run `gh auth login` to use repository suggestions."
                    .to_string()
            } else {
                format!("Failed to run GitHub CLI: {err}")
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err(
                "Unable to load GitHub repositories. Ensure gh is authenticated with `gh auth login`."
                    .to_string(),
            );
        }
        return Err(format!("Unable to load GitHub repositories: {stderr}"));
    }

    let raw_items: Vec<GitHubRepoListItem> = serde_json::from_slice(&output.stdout).map_err(|err| {
        format!("Unable to parse GitHub repository list from gh output: {err}")
    })?;

    let mut repos: Vec<GitHubRepoOption> = raw_items
        .into_iter()
        .map(|item| GitHubRepoOption {
            name_with_owner: item.name_with_owner,
            url: item.url,
            is_private: item.is_private,
            updated_at: item.updated_at.unwrap_or_default(),
        })
        .collect();

    let normalized_tokens = query
        .as_deref()
        .map(normalize_search_tokens)
        .unwrap_or_default();

    repos.sort_by(|left, right| {
        let left_score = repo_match_score(left, &normalized_tokens);
        let right_score = repo_match_score(right, &normalized_tokens);

        right_score
            .cmp(&left_score)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
            .then_with(|| left.name_with_owner.cmp(&right.name_with_owner))
    });

    repos.retain(|repo| repo_match_score(repo, &normalized_tokens) > 0);
    repos.truncate(20);
    Ok(repos)
}

#[tauri::command]
pub fn workspace_list_known_repos(
    query: Option<String>,
    state: State<'_, WorkspaceState>,
) -> Result<Vec<KnownRepoOption>, String> {
    let store = lock_store(&state)?;
    Ok(store.list_known_repos(query.as_deref()))
}

#[tauri::command]
pub async fn workspace_list_repo_pull_requests(
    repo_id: String,
    query: Option<String>,
) -> Result<Vec<super::model::WorkspacePullRequestOption>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_repo_pull_requests(&repo_id, query.as_deref()).map_err(to_command_error)
    })
    .await
    .map_err(|err| format!("Failed to load pull requests: {err}"))?
}

#[tauri::command]
pub async fn workspace_list_repo_branches(
    repo_id: String,
    query: Option<String>,
) -> Result<Vec<super::model::WorkspaceBranchOption>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_repo_branches(&repo_id, query.as_deref()).map_err(to_command_error)
    })
    .await
    .map_err(|err| format!("Failed to load branches: {err}"))?
}

#[tauri::command]
pub async fn workspace_list_repo_issues(
    repo_id: String,
    query: Option<String>,
) -> Result<Vec<super::model::WorkspaceIssueOption>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_repo_issues(&repo_id, query.as_deref()).map_err(to_command_error)
    })
    .await
    .map_err(|err| format!("Failed to load issues: {err}"))?
}

#[tauri::command]
pub fn workspace_list(state: State<'_, WorkspaceState>) -> Result<Vec<Workspace>, String> {
    let store = lock_store(&state)?;
    Ok(store.list())
}

#[tauri::command]
pub fn workspace_get_active_id(state: State<'_, WorkspaceState>) -> Result<Option<String>, String> {
    let store = lock_store(&state)?;
    Ok(store.active_workspace_id())
}

#[tauri::command]
pub fn workspace_set_active(id: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let mut store = lock_store(&state)?;
    store.set_active(&id).map_err(to_command_error)?;
    store.save().map_err(to_command_error)?;
    Ok(())
}

#[tauri::command]
pub async fn workspace_create_local(
    input: CreateLocalWorkspaceInput,
    state: State<'_, WorkspaceState>,
) -> Result<Workspace, String> {
    let workspace_id = next_workspace_id();
    let suffix_owned = workspace_suffix(&workspace_id).to_string();
    let workspaces_root = state.app_data_dir.join("workspaces");
    let ws_name = input.workspace_name.clone();
    let source = input.repo_path.clone();

    let prepared = tauri::async_runtime::spawn_blocking(move || {
        create_local_workspace(
            Path::new(&input.repo_path),
            &input.workspace_name,
            input.branch_name,
            input.base_ref,
            &suffix_owned,
            &workspaces_root,
        )
    })
    .await
    .map_err(|err| format!("Task failed: {err}"))?
    .map_err(to_command_error)?;

    let workspace = build_workspace(workspace_id, ws_name, WorkspaceSourceType::Local, source, prepared);
    persist_workspace(&state, workspace)
}

#[tauri::command]
pub async fn workspace_create_github(
    input: CreateGitHubWorkspaceInput,
    state: State<'_, WorkspaceState>,
) -> Result<Workspace, String> {
    let workspace_id = next_workspace_id();
    let suffix_owned = workspace_suffix(&workspace_id).to_string();
    let app_data_dir = state.app_data_dir.clone();
    let ws_name = input.workspace_name.clone();
    let source = input.repo_url.clone();

    let prepared = tauri::async_runtime::spawn_blocking(move || {
        create_github_workspace(
            &input.repo_url,
            &input.workspace_name,
            input.clone_root_path,
            input.branch_name,
            input.base_ref,
            &suffix_owned,
            &app_data_dir,
        )
    })
    .await
    .map_err(|err| format!("Task failed: {err}"))?
    .map_err(to_command_error)?;

    let workspace = build_workspace(workspace_id, ws_name, WorkspaceSourceType::Github, source, prepared);
    persist_workspace(&state, workspace)
}

#[tauri::command]
pub async fn workspace_create_new_github(
    input: CreateNewGitHubWorkspaceInput,
    state: State<'_, WorkspaceState>,
) -> Result<Workspace, String> {
    let workspace_id = next_workspace_id();
    let suffix_owned = workspace_suffix(&workspace_id).to_string();
    let app_data_dir = state.app_data_dir.clone();
    let ws_name = input.workspace_name.clone();

    let created = tauri::async_runtime::spawn_blocking(move || {
        create_new_github_workspace(
            &input.repository_name,
            &input.workspace_name,
            input.clone_root_path,
            input.branch_name,
            input.base_ref,
            &suffix_owned,
            &app_data_dir,
        )
    })
    .await
    .map_err(|err| format!("Task failed: {err}"))?
    .map_err(to_command_error)?;

    let workspace = build_workspace(
        workspace_id,
        ws_name,
        WorkspaceSourceType::Github,
        created.repo_url,
        created.prepared,
    );
    persist_workspace(&state, workspace)
}

#[tauri::command]
pub async fn workspace_create_from_source(
    input: CreateWorkspaceFromSourceInput,
    state: State<'_, WorkspaceState>,
) -> Result<Workspace, String> {
    let workspace_id = next_workspace_id();
    let suffix_owned = workspace_suffix(&workspace_id).to_string();
    let app_data_dir = state.app_data_dir.clone();

    let repo_id = input.repo_id.trim().to_string();
    if repo_id.is_empty() {
        return Err("Repository selection is required".to_string());
    }
    let repo_url = repo_url_from_id(&repo_id).map_err(to_command_error)?;
    let fallback_name = repo_id
        .split('/')
        .filter(|segment| !segment.trim().is_empty())
        .last()
        .unwrap_or("Workspace")
        .to_string();
    let workspace_name = input
        .workspace_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback_name.as_str())
        .to_string();

    let clone_root_path = input.clone_root_path.clone();
    let source = input.source.clone();
    let source_value = repo_url.clone();
    let workspace_name_for_create = workspace_name.clone();

    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let (branch_name, base_ref) = match source {
            WorkspaceCreateFromSource::Default => (None, None),
            WorkspaceCreateFromSource::PullRequest { value } => {
                let head_branch = pull_request_head_branch(&repo_id, value)?;
                (None, Some(format!("origin/{head_branch}")))
            }
            WorkspaceCreateFromSource::Branch { value } => {
                let normalized = value.trim().trim_start_matches("origin/").to_string();
                if normalized.is_empty() {
                    return Err(WorkspaceError::InvalidInput(
                        "Branch selection is required".to_string(),
                    ));
                }
                (None, Some(format!("origin/{normalized}")))
            }
            WorkspaceCreateFromSource::Issue { value } => {
                let default_branch = repo_default_branch(&repo_id)?;
                (
                    Some(format!("feature/issue-{value}")),
                    Some(format!("origin/{default_branch}")),
                )
            }
        };

        create_github_workspace(
            &repo_url,
            &workspace_name_for_create,
            clone_root_path,
            branch_name,
            base_ref,
            &suffix_owned,
            &app_data_dir,
        )
    })
    .await
    .map_err(|err| format!("Task failed: {err}"))?
    .map_err(to_command_error)?;

    let workspace = build_workspace(
        workspace_id,
        workspace_name,
        WorkspaceSourceType::Github,
        source_value,
        prepared,
    );
    persist_workspace(&state, workspace)
}

#[tauri::command]
pub async fn workspace_pick_directory(default_path: Option<String>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(path) = default_path.filter(|value| !value.trim().is_empty()) {
            dialog = dialog.set_directory(Path::new(&path));
        }
        let selected = dialog.pick_folder();
        Ok(selected.map(|path| path.to_string_lossy().to_string()))
    })
    .await
    .map_err(|err| format!("Dialog task failed: {err}"))?
}

#[tauri::command]
pub fn workspace_archive(id: String, state: State<'_, WorkspaceState>) -> Result<(), String> {
    let mut store = lock_store(&state)?;
    store.archive(&id).map_err(to_command_error)?;
    store.save().map_err(to_command_error)?;
    Ok(())
}

#[tauri::command]
pub async fn workspace_delete(
    id: String,
    remove_files: bool,
    state: State<'_, WorkspaceState>,
) -> Result<(), String> {
    let removed = {
        let mut store = lock_store(&state)?;
        let removed = store.remove(&id).map_err(to_command_error)?;
        store.save().map_err(to_command_error)?;
        removed
    };

    if remove_files {
        let worktree_path = removed.worktree_path;
        tauri::async_runtime::spawn_blocking(move || {
            remove_worktree_files(&worktree_path)
        })
        .await
        .map_err(|err| format!("Cleanup task failed: {err}"))?
        .map_err(|err| err.to_string())?;
    }

    Ok(())
}

fn remove_worktree_files(worktree_path: &str) -> Result<(), WorkspaceError> {
    let path = Path::new(worktree_path);
    if !path.exists() {
        return Ok(());
    }

    // Remove via git first to clean up .git/worktrees metadata, then
    // fall back to filesystem removal if git worktree remove fails
    // (e.g. the directory is not a linked worktree).
    let git_result = Command::new("git")
        .args(["worktree", "remove", "--force"])
        .arg(path)
        .output();

    let git_removed = match git_result {
        Ok(output) => output.status.success(),
        Err(err) => {
            eprintln!(
                "Warning: git worktree remove failed for {}: {err}. \
                 Falling back to filesystem removal. \
                 You may need to run `git worktree prune` in the parent repository.",
                path.display()
            );
            false
        }
    };

    if !git_removed {
        fs::remove_dir_all(path)?;
    }

    Ok(())
}
