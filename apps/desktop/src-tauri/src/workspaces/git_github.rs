use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::Utc;
use serde::Deserialize;
use url::Url;

use super::git_local::create_local_workspace;
use super::model::{
    WorkspaceBranchOption, WorkspaceIssueOption, WorkspacePullRequestOption, PreparedWorkspace,
};
use super::WorkspaceError;

pub struct CreatedGitHubWorkspace {
    pub prepared: PreparedWorkspace,
    pub repo_url: String,
}

pub fn create_github_workspace(
    repo_url: &str,
    workspace_name: &str,
    clone_root_path: Option<String>,
    branch_name: Option<String>,
    base_ref: Option<String>,
    suffix: &str,
    app_data_dir: &Path,
) -> Result<PreparedWorkspace, WorkspaceError> {
    let (owner, repo) = parse_github_repo_url(repo_url)?;
    let clone_root = normalize_clone_root_path(
        clone_root_path,
        app_data_dir,
        app_data_dir.join("repo-cache").join("github"),
    );
    let cache_repo_path = clone_root.join(format!("{owner}__{repo}"));

    if cache_repo_path.exists() {
        run_git_in_dir(&cache_repo_path, &["fetch", "--all", "--prune"])?;
    } else {
        if let Some(parent) = cache_repo_path.parent() {
            fs::create_dir_all(parent)?;
        }
        run_git_in_dir(
            app_data_dir,
            &[
                "clone",
                repo_url,
                cache_repo_path.to_string_lossy().as_ref(),
            ],
        )?;
    }

    let workspaces_root = app_data_dir.join("workspaces");
    create_local_workspace(
        &cache_repo_path,
        workspace_name,
        branch_name,
        base_ref,
        suffix,
        &workspaces_root,
    )
}

pub fn create_new_github_workspace(
    repository_name: &str,
    workspace_name: &str,
    clone_root_path: Option<String>,
    branch_name: Option<String>,
    base_ref: Option<String>,
    suffix: &str,
    app_data_dir: &Path,
) -> Result<CreatedGitHubWorkspace, WorkspaceError> {
    let clone_root = normalize_clone_root_path(
        clone_root_path,
        app_data_dir,
        app_data_dir.join("repo-cache").join("github-created"),
    );
    fs::create_dir_all(&clone_root)?;

    let (owner_override, repo) = split_repository_name(repository_name)?;
    let owner = match owner_override {
        Some(owner) => owner,
        None => gh_authenticated_owner(&clone_root)?,
    };
    let repo_identifier = format!("{owner}/{repo}");
    let repo_url = format!("https://github.com/{repo_identifier}");

    let clone_destination = clone_root.join(&repo);
    if clone_destination.exists() {
        return Err(WorkspaceError::InvalidInput(format!(
            "Clone destination already exists: {}",
            clone_destination.display()
        )));
    }

    run_gh(
        &clone_root,
        &[
            "repo",
            "create",
            &repo_identifier,
            "--private",
            "--clone",
            "--add-readme",
        ],
    )?;

    let workspaces_root = app_data_dir.join("workspaces");
    let prepared = create_local_workspace(
        &clone_destination,
        workspace_name,
        branch_name,
        base_ref,
        suffix,
        &workspaces_root,
    )?;

    Ok(CreatedGitHubWorkspace { prepared, repo_url })
}

pub fn repo_url_from_id(repo_id: &str) -> Result<String, WorkspaceError> {
    let trimmed = repo_id.trim().trim_matches('/');
    let parts = trimmed
        .split('/')
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>();
    match parts.as_slice() {
        [owner, repo] => Ok(format!(
            "https://github.com/{}/{}",
            owner.trim(),
            repo.trim().trim_end_matches(".git")
        )),
        _ => Err(WorkspaceError::InvalidInput(
            "Repository id must be \"owner/repo\"".to_string(),
        )),
    }
}

pub fn list_repo_pull_requests(
    repo_id: &str,
    query: Option<&str>,
) -> Result<Vec<WorkspacePullRequestOption>, WorkspaceError> {
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PullRequestItem {
        number: i64,
        title: String,
        head_ref_name: String,
        updated_at: Option<String>,
    }

    let output = run_gh(
        Path::new("."),
        &[
            "pr",
            "list",
            "--repo",
            repo_id,
            "--limit",
            "100",
            "--state",
            "open",
            "--json",
            "number,title,headRefName,updatedAt",
        ],
    )?;
    let mut items = serde_json::from_str::<Vec<PullRequestItem>>(&output)
        .map_err(|err| WorkspaceError::GitFailed(format!("Failed to parse PR list: {err}")))?
        .into_iter()
        .map(|item| WorkspacePullRequestOption {
            number: item.number,
            title: item.title,
            head_branch: item.head_ref_name,
            updated_at: item.updated_at.unwrap_or_else(|| Utc::now().to_rfc3339()),
        })
        .collect::<Vec<_>>();

    if let Some(filter) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let needle = filter.to_lowercase();
        items.retain(|item| {
            format!("{} {} {}", item.number, item.title, item.head_branch)
                .to_lowercase()
                .contains(&needle)
        });
    }

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    items.truncate(20);
    Ok(items)
}

pub fn list_repo_issues(
    repo_id: &str,
    query: Option<&str>,
) -> Result<Vec<WorkspaceIssueOption>, WorkspaceError> {
    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct IssueItem {
        number: i64,
        title: String,
        updated_at: Option<String>,
    }

    let output = run_gh(
        Path::new("."),
        &[
            "issue",
            "list",
            "--repo",
            repo_id,
            "--limit",
            "100",
            "--state",
            "open",
            "--json",
            "number,title,updatedAt",
        ],
    )?;
    let mut items = serde_json::from_str::<Vec<IssueItem>>(&output)
        .map_err(|err| WorkspaceError::GitFailed(format!("Failed to parse issue list: {err}")))?
        .into_iter()
        .map(|item| WorkspaceIssueOption {
            number: item.number,
            title: item.title,
            updated_at: item.updated_at.unwrap_or_else(|| Utc::now().to_rfc3339()),
        })
        .collect::<Vec<_>>();

    if let Some(filter) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let needle = filter.to_lowercase();
        items.retain(|item| {
            format!("{} {}", item.number, item.title)
                .to_lowercase()
                .contains(&needle)
        });
    }

    items.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    items.truncate(20);
    Ok(items)
}

pub fn list_repo_branches(
    repo_id: &str,
    query: Option<&str>,
) -> Result<Vec<WorkspaceBranchOption>, WorkspaceError> {
    let repo_url = repo_url_from_id(repo_id)?;
    let default_name = repo_default_branch(repo_id)?;
    let output = Command::new("git")
        .args(["ls-remote", "--heads", &repo_url])
        .output()
        .map_err(WorkspaceError::Io)?;
    if !output.status.success() {
        return Err(WorkspaceError::GitFailed(format!(
            "git ls-remote failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    let mut items = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let (_, ref_name) = line.split_once('\t')?;
            let branch = ref_name.strip_prefix("refs/heads/")?.to_string();
            Some(WorkspaceBranchOption {
                is_default: branch == default_name,
                name: branch,
                updated_at: Utc::now().to_rfc3339(),
            })
        })
        .collect::<Vec<_>>();

    if let Some(filter) = query.map(str::trim).filter(|value| !value.is_empty()) {
        let needle = filter.to_lowercase();
        items.retain(|item| item.name.to_lowercase().contains(&needle));
    }

    items.sort_by(|left, right| {
        right
            .is_default
            .cmp(&left.is_default)
            .then_with(|| left.name.cmp(&right.name))
    });
    items.truncate(20);
    Ok(items)
}

pub fn repo_default_branch(repo_id: &str) -> Result<String, WorkspaceError> {
    let default_branch = run_gh(
        Path::new("."),
        &[
            "repo",
            "view",
            repo_id,
            "--json",
            "defaultBranchRef",
            "--jq",
            ".defaultBranchRef.name",
        ],
    )?;
    let branch = default_branch.trim();
    if branch.is_empty() {
        return Err(WorkspaceError::InvalidInput(format!(
            "Unable to determine default branch for repository: {repo_id}"
        )));
    }
    Ok(branch.to_string())
}

pub fn pull_request_head_branch(repo_id: &str, number: i64) -> Result<String, WorkspaceError> {
    let output = run_gh(
        Path::new("."),
        &[
            "pr",
            "view",
            "--repo",
            repo_id,
            &number.to_string(),
            "--json",
            "headRefName",
            "--jq",
            ".headRefName",
        ],
    )?;
    let branch = output.trim();
    if branch.is_empty() {
        return Err(WorkspaceError::InvalidInput(format!(
            "Pull request not found: {number}"
        )));
    }
    Ok(branch.to_string())
}

fn parse_github_repo_url(repo_url: &str) -> Result<(String, String), WorkspaceError> {
    let parsed = Url::parse(repo_url).map_err(|_| {
        WorkspaceError::InvalidInput(
            "Only https://github.com/<owner>/<repo> repositories are supported".to_string(),
        )
    })?;

    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err(WorkspaceError::InvalidInput(
            "Only github.com repositories are supported".to_string(),
        ));
    }

    let mut segments = parsed.path_segments().ok_or_else(|| {
        WorkspaceError::InvalidInput("Invalid github repository URL".to_string())
    })?;

    let owner = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| WorkspaceError::InvalidInput("Invalid github repository URL".to_string()))?;
    let repo = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| WorkspaceError::InvalidInput("Invalid github repository URL".to_string()))?;

    let repo_name = repo.strip_suffix(".git").unwrap_or(repo).to_string();
    Ok((owner.to_string(), repo_name))
}

fn normalize_clone_root_path(
    clone_root_path: Option<String>,
    app_data_dir: &Path,
    default_root: PathBuf,
) -> PathBuf {
    let home_dir = detect_home_dir();
    normalize_clone_root_path_with_home(
        clone_root_path,
        app_data_dir,
        default_root,
        home_dir.as_deref(),
    )
}

fn normalize_clone_root_path_with_home(
    clone_root_path: Option<String>,
    app_data_dir: &Path,
    default_root: PathBuf,
    home_dir: Option<&Path>,
) -> PathBuf {
    let Some(raw) = clone_root_path else {
        return default_root;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return default_root;
    }

    let expanded = expand_home_prefix(trimmed, home_dir).unwrap_or_else(|| PathBuf::from(trimmed));
    if expanded.is_absolute() {
        expanded
    } else {
        app_data_dir.join(expanded)
    }
}

fn expand_home_prefix(path: &str, home_dir: Option<&Path>) -> Option<PathBuf> {
    let home = home_dir?;
    if path == "~" {
        return Some(home.to_path_buf());
    }
    if let Some(rest) = path
        .strip_prefix("~/")
        .or_else(|| path.strip_prefix("~\\"))
    {
        return Some(home.join(rest));
    }
    None
}

fn detect_home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn run_git_in_dir(cwd: &Path, args: &[&str]) -> Result<String, WorkspaceError> {
    let output = Command::new("git").current_dir(cwd).args(args).output()?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(WorkspaceError::GitFailed(format!(
            "git {} failed: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        )))
    }
}

fn gh_authenticated_owner(cwd: &Path) -> Result<String, WorkspaceError> {
    let login = run_gh(cwd, &["api", "user", "--jq", ".login"])?;
    let owner = login.trim();
    if owner.is_empty() {
        return Err(WorkspaceError::InvalidInput(
            "Unable to determine authenticated GitHub user. Run `gh auth login` and try again."
                .to_string(),
        ));
    }
    Ok(owner.to_string())
}

fn split_repository_name(repository_name: &str) -> Result<(Option<String>, String), WorkspaceError> {
    let normalized = repository_name.trim().trim_end_matches(".git");
    if normalized.is_empty() {
        return Err(WorkspaceError::InvalidInput(
            "Repository name is required".to_string(),
        ));
    }

    let segments = normalized
        .split('/')
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    match segments.as_slice() {
        [repo] => Ok((None, (*repo).to_string())),
        [owner, repo] => Ok((Some((*owner).to_string()), (*repo).to_string())),
        _ => Err(WorkspaceError::InvalidInput(
            "Repository name must be \"<name>\" or \"<owner>/<name>\"".to_string(),
        )),
    }
}

fn run_gh(cwd: &Path, args: &[&str]) -> Result<String, WorkspaceError> {
    let output = Command::new("gh")
        .current_dir(cwd)
        .args(args)
        .output()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                WorkspaceError::InvalidInput(
                    "GitHub CLI not found. Install gh and run `gh auth login`.".to_string(),
                )
            } else {
                WorkspaceError::Io(error)
            }
        })?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(WorkspaceError::GitFailed(format!(
                "gh {} failed",
                args.join(" ")
            )))
        } else {
            Err(WorkspaceError::GitFailed(stderr))
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        create_github_workspace, normalize_clone_root_path_with_home, split_repository_name,
    };

    #[test]
    fn rejects_non_github_remote_urls() {
        let app_data_dir = tempfile::tempdir().unwrap();
        let err = create_github_workspace(
            "https://gitlab.com/org/repo",
            "KAT-154",
            None,
            None,
            None,
            "ab12",
            app_data_dir.path(),
        )
        .unwrap_err();
        assert!(err.to_string().contains("github.com"));
    }

    #[test]
    fn parses_repository_name_with_optional_owner() {
        let without_owner = split_repository_name("kat-154-created").unwrap();
        assert_eq!(without_owner.0, None);
        assert_eq!(without_owner.1, "kat-154-created".to_string());

        let with_owner = split_repository_name("kata-sh/kat-154-created.git").unwrap();
        assert_eq!(with_owner.0, Some("kata-sh".to_string()));
        assert_eq!(with_owner.1, "kat-154-created".to_string());
    }

    #[test]
    fn normalizes_clone_roots_for_tilde_relative_and_defaults() {
        let app_data = Path::new("/tmp/kata-app-data");
        let home = Path::new("/Users/tester");

        let tilde = normalize_clone_root_path_with_home(
            Some("~/kata/repos".to_string()),
            app_data,
            Path::new("/tmp/default").to_path_buf(),
            Some(home),
        );
        assert_eq!(tilde, Path::new("/Users/tester/kata/repos"));

        let relative = normalize_clone_root_path_with_home(
            Some("kata/repos".to_string()),
            app_data,
            Path::new("/tmp/default").to_path_buf(),
            Some(home),
        );
        assert_eq!(relative, Path::new("/tmp/kata-app-data/kata/repos"));

        let fallback = normalize_clone_root_path_with_home(
            Some("~".to_string()),
            app_data,
            Path::new("/tmp/default").to_path_buf(),
            Some(home),
        );
        assert_eq!(fallback, Path::new("/Users/tester"));

        let defaulted = normalize_clone_root_path_with_home(
            Some("   ".to_string()),
            app_data,
            Path::new("/tmp/default").to_path_buf(),
            Some(home),
        );
        assert_eq!(defaulted, Path::new("/tmp/default"));
    }

    #[test]
    fn rejects_invalid_repository_name_shapes() {
        let err = split_repository_name("owner/repo/extra").unwrap_err();
        assert!(err.to_string().contains("<owner>/<name>"));
    }
}
