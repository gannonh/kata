//! Workspace manager — creates/reuses per-issue directories, runs lifecycle hooks.
//!
//! Full implementation in S04/T03. This is the public API skeleton so tests compile.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::docker;
use crate::domain::{HooksConfig, Issue, Workspace, WorkspaceConfig, WorkspaceRepoStrategy};
use crate::error::{Result, SymphonyError};
use crate::path_safety;
use crate::repo_url::{redact_url_credentials, repo_is_remote};

const SYMPHONY_INJECTED_SKILL_IGNORE: &str = ".agents/skills/sym-*";

#[derive(Debug, Clone)]
struct HookIssueContext {
    issue_id: String,
    issue_identifier: String,
    issue_title: String,
}

impl HookIssueContext {
    fn from_identifier(identifier: &str) -> Self {
        Self {
            issue_id: String::new(),
            issue_identifier: identifier.to_string(),
            issue_title: String::new(),
        }
    }

    fn from_issue(issue: &Issue) -> Self {
        Self {
            issue_id: issue.id.clone(),
            issue_identifier: issue.identifier.clone(),
            issue_title: issue.title.clone(),
        }
    }

    fn from_issue_or_identifier(issue: Option<&Issue>, identifier: &str) -> Self {
        issue
            .map(Self::from_issue)
            .unwrap_or_else(|| Self::from_identifier(identifier))
    }
}

/// Create or reuse a workspace directory for the given identifier.
///
/// - Sanitizes the identifier via `path_safety::sanitize_identifier`
/// - Computes the workspace path under `config.root`
/// - Validates that the workspace stays within the root (no symlink escapes)
/// - Creates the directory if missing, reuses if present, replaces non-dirs
/// - Runs repository bootstrap (when configured) before `after_create`
/// - Runs the `after_create` hook if the directory was newly created
pub fn ensure_workspace(
    identifier: &str,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<Workspace> {
    ensure_workspace_internal(
        identifier,
        None,
        config,
        hooks,
        ExistingWorkspaceRefreshPolicy::Strict,
    )
    .map(|prepared| prepared.workspace)
}

/// Issue-aware variant that injects full issue metadata into hook env vars.
pub fn ensure_workspace_for_issue(
    issue: &Issue,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<Workspace> {
    ensure_workspace_internal(
        &issue.identifier,
        Some(issue),
        config,
        hooks,
        ExistingWorkspaceRefreshPolicy::Strict,
    )
    .map(|prepared| prepared.workspace)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExistingWorkspaceRefreshPolicy {
    Strict,
    AllowStale,
}

#[derive(Debug, Clone)]
pub struct WorkspacePreparation {
    pub workspace: Workspace,
    pub refresh_notice: Option<WorkspaceRefreshNotice>,
}

#[derive(Debug, Clone)]
pub struct WorkspaceRefreshNotice {
    pub clone_branch: String,
    pub workspace_head: String,
    pub clone_branch_head: String,
    pub dirty_status: Option<String>,
    pub reason: String,
}

impl WorkspaceRefreshNotice {
    pub fn to_prompt_context(&self) -> String {
        let mut lines = vec![
            "## Workspace Status".to_string(),
            String::new(),
            format!(
                "Symphony skipped automatic refresh from `{}` because {}.",
                self.clone_branch, self.reason
            ),
            String::new(),
            format!("- Workspace HEAD: `{}`", self.workspace_head),
            format!(
                "- `{}` HEAD: `{}`",
                self.clone_branch, self.clone_branch_head
            ),
        ];

        if let Some(status) = self.dirty_status.as_deref() {
            lines.push("- Workspace status: dirty".to_string());
            lines.push("- Local changes:".to_string());
            for line in status
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
            {
                lines.push(format!("  - `{line}`"));
            }
        } else {
            lines.push("- Workspace status: clean with local commits or divergence".to_string());
        }

        lines.push(String::new());
        lines.push(
            "Continue from the current workspace state. Preserve local work. Before opening or updating a PR, reconcile this branch with latest base branch changes."
                .to_string(),
        );

        lines.join("\n")
    }
}

pub fn ensure_workspace_for_issue_with_refresh_policy(
    issue: &Issue,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
    refresh_policy: ExistingWorkspaceRefreshPolicy,
) -> Result<WorkspacePreparation> {
    ensure_workspace_internal(
        &issue.identifier,
        Some(issue),
        config,
        hooks,
        refresh_policy,
    )
}

fn ensure_workspace_internal(
    identifier: &str,
    issue: Option<&Issue>,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
    refresh_policy: ExistingWorkspaceRefreshPolicy,
) -> Result<WorkspacePreparation> {
    let safe_id = path_safety::sanitize_identifier(identifier);
    let hook_issue = HookIssueContext::from_issue_or_identifier(issue, identifier);

    let root_path = Path::new(&config.root);
    let canonical_root = path_safety::canonicalize(root_path)?;
    let workspace_path = canonical_root.join(&safe_id);

    // Canonicalize workspace path (tolerates non-existent tail)
    let canonical_workspace = path_safety::canonicalize(&workspace_path)?;

    // Validate containment
    validate_workspace_path(&canonical_workspace, &canonical_root)?;

    // Create or reuse
    let (final_path, created_now) = if canonical_workspace.is_dir() {
        (canonical_workspace.clone(), false)
    } else if canonical_workspace.exists() {
        // Non-directory exists — replace it
        std::fs::remove_file(&canonical_workspace)
            .or_else(|_| std::fs::remove_dir_all(&canonical_workspace))?;
        std::fs::create_dir_all(&canonical_workspace)?;
        (canonical_workspace.clone(), true)
    } else {
        std::fs::create_dir_all(&canonical_workspace)?;
        (canonical_workspace.clone(), true)
    };

    // Run bootstrap + after_create hook if newly created — clean up on failure
    if created_now {
        if let Err(err) = bootstrap_repository(&final_path, config, &hook_issue.issue_identifier) {
            let _ = std::fs::remove_dir_all(&final_path);
            return Err(err);
        }

        if let Some(ref command) = hooks.after_create {
            if let Err(err) = run_hook(
                "after_create",
                command,
                &final_path,
                hooks.timeout_ms,
                &hook_issue,
            ) {
                // Remove the partially-initialized workspace so the next call
                // doesn't silently reuse it with created_now=false
                let _ = std::fs::remove_dir_all(&final_path);
                return Err(err);
            }
        }
    }

    let refresh_notice = if created_now {
        None
    } else {
        refresh_existing_workspace_from_clone_branch(&final_path, config, refresh_policy)?
    };

    Ok(WorkspacePreparation {
        workspace: Workspace {
            path: final_path.to_string_lossy().to_string(),
            workspace_key: safe_id,
            created_now,
        },
        refresh_notice,
    })
}

/// Validate that `workspace` is a proper child of `root`:
/// - Not equal to root
/// - Canonically under root/
/// - No symlink escapes
pub fn validate_workspace_path(workspace: &Path, root: &Path) -> Result<()> {
    let canonical_workspace = path_safety::canonicalize(workspace)?;
    let canonical_root = path_safety::canonicalize(root)?;

    if canonical_workspace == canonical_root {
        return Err(SymphonyError::WorkspaceOutsideRoot {
            workspace: canonical_workspace.to_string_lossy().to_string(),
            root: canonical_root.to_string_lossy().to_string(),
        });
    }

    // Must be a proper descendant of root (component-level check)
    if !canonical_workspace.starts_with(&canonical_root) {
        return Err(SymphonyError::WorkspaceOutsideRoot {
            workspace: canonical_workspace.to_string_lossy().to_string(),
            root: canonical_root.to_string_lossy().to_string(),
        });
    }

    Ok(())
}

/// Scan workspace directories and map them by issue identifier.
///
/// The canonical workspace layout is `<root>/<identifier>`, but we also scan the
/// branch-prefixed fallback `<root>/<branch_prefix>/<identifier>` to cover legacy/manual
/// directory layouts.
///
/// This is used by orchestrator startup cleanup to recover orphan workspace paths for issues
/// that reached terminal state while Symphony was not running.
pub fn scan_workspace_root(root: &Path, branch_prefix: &str) -> HashMap<String, PathBuf> {
    let mut discovered = HashMap::new();

    scan_workspace_directory(root, &mut discovered);

    let normalized_prefix = branch_prefix.trim_matches('/');
    if normalized_prefix.is_empty() {
        return discovered;
    }

    let prefix_path = normalized_prefix
        .split('/')
        .fold(root.to_path_buf(), |acc, segment| acc.join(segment));

    if prefix_path != root {
        scan_workspace_directory(&prefix_path, &mut discovered);
    }

    discovered
}

fn scan_workspace_directory(scan_root: &Path, discovered: &mut HashMap<String, PathBuf>) {
    let entries = match std::fs::read_dir(scan_root) {
        Ok(entries) => entries,
        Err(err) => {
            tracing::debug!(
                event = "startup_workspace_scan_unavailable",
                scan_root = %scan_root.display(),
                error = %err,
                "workspace directory unavailable during startup scan"
            );
            return;
        }
    };

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(err) => {
                tracing::warn!(
                    event = "startup_workspace_scan_entry_error",
                    scan_root = %scan_root.display(),
                    error = %err,
                    "failed to read workspace entry; skipping"
                );
                continue;
            }
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(err) => {
                tracing::warn!(
                    event = "startup_workspace_scan_file_type_error",
                    path = %entry.path().display(),
                    error = %err,
                    "failed to inspect workspace entry type; skipping"
                );
                continue;
            }
        };

        if !file_type.is_dir() {
            continue;
        }

        let identifier = entry
            .file_name()
            .to_str()
            .map(str::trim)
            .filter(|candidate| looks_like_issue_identifier(candidate))
            .map(ToString::to_string);

        let Some(identifier) = identifier else {
            continue;
        };

        let path = std::fs::canonicalize(entry.path()).unwrap_or_else(|_| entry.path());
        tracing::debug!(
            event = "startup_workspace_scan_match",
            issue_identifier = %identifier,
            workspace_path = %path.display(),
            "discovered startup workspace candidate"
        );

        discovered.entry(identifier).or_insert(path);
    }
}

fn looks_like_issue_identifier(value: &str) -> bool {
    let Some((team, number)) = value.split_once('-') else {
        return false;
    };

    !team.is_empty()
        && !number.is_empty()
        && team.chars().all(|ch| ch.is_ascii_alphanumeric())
        && number.chars().all(|ch| ch.is_ascii_digit())
}

/// Run repository bootstrap (clone/worktree + branch creation) when configured.
fn bootstrap_repository(
    workspace: &Path,
    config: &WorkspaceConfig,
    issue_identifier: &str,
) -> Result<()> {
    let Some(repo) = config.repo.as_deref() else {
        return Ok(());
    };

    let branch_name = branch_name_for_issue(config, issue_identifier);
    let workspace_str = workspace.to_string_lossy().to_string();
    let effective_strategy = match config.strategy {
        WorkspaceRepoStrategy::Auto => {
            if repo_is_remote(repo) {
                WorkspaceRepoStrategy::CloneRemote
            } else {
                WorkspaceRepoStrategy::CloneLocal
            }
        }
        other => other,
    };

    match effective_strategy {
        WorkspaceRepoStrategy::CloneLocal => {
            if repo_is_remote(repo) {
                return Err(SymphonyError::InvalidWorkflowConfig(
                    "workspace.git_strategy 'clone-local' requires workspace.repo to be a local path"
                        .to_string(),
                ));
            }
            let mut clone_cmd = Command::new("git");
            clone_cmd.arg("clone").arg("--local");
            if let Some(clone_branch) = config.clone_branch.as_deref() {
                clone_cmd.arg("--branch").arg(clone_branch);
            }
            clone_cmd.arg(repo).arg(".");
            clone_cmd.current_dir(workspace);
            run_git_command(clone_cmd, "workspace clone-local bootstrap")?;

            let mut checkout_cmd = Command::new("git");
            checkout_cmd
                .arg("checkout")
                .arg("-b")
                .arg(&branch_name)
                .current_dir(workspace);
            run_git_command(checkout_cmd, "workspace branch bootstrap")
        }
        WorkspaceRepoStrategy::CloneRemote => {
            let mut clone_cmd = Command::new("git");
            clone_cmd
                .arg("clone")
                .arg(repo)
                .arg(".")
                .arg("--single-branch");
            if let Some(clone_branch) = config.clone_branch.as_deref() {
                clone_cmd.arg("--branch").arg(clone_branch);
            }
            clone_cmd.current_dir(workspace);
            run_git_command(clone_cmd, "workspace clone-remote bootstrap")?;

            let mut checkout_cmd = Command::new("git");
            checkout_cmd
                .arg("checkout")
                .arg("-b")
                .arg(&branch_name)
                .current_dir(workspace);
            run_git_command(checkout_cmd, "workspace branch bootstrap")
        }
        WorkspaceRepoStrategy::Worktree => {
            if repo_is_remote(repo) {
                return Err(SymphonyError::InvalidWorkflowConfig(
                    "workspace.strategy 'worktree' requires workspace.repo to be a local path"
                        .to_string(),
                ));
            }

            // Older git versions require a non-existent target path for
            // `git worktree add`. remove the pre-created empty directory first.
            if workspace.exists() {
                std::fs::remove_dir(workspace)?;
            }

            let mut worktree_cmd = Command::new("git");
            worktree_cmd.arg("-C").arg(repo).arg("worktree").arg("add");
            if git_branch_exists(repo, &branch_name)? {
                worktree_cmd.arg(&workspace_str).arg(&branch_name);
            } else {
                worktree_cmd.arg(&workspace_str).arg("-b").arg(&branch_name);
                if let Some(clone_branch) = config.clone_branch.as_deref() {
                    // Start point: create the worktree branch from this ref
                    // instead of the repo's current HEAD.
                    worktree_cmd.arg(clone_branch);
                }
            }
            run_git_command(worktree_cmd, "workspace worktree bootstrap")
        }
        WorkspaceRepoStrategy::Auto => unreachable!("auto strategy must resolve before bootstrap"),
    }
}

fn branch_name_for_issue(config: &WorkspaceConfig, issue_identifier: &str) -> String {
    let sanitized_identifier = path_safety::sanitize_identifier(issue_identifier);
    format!("{}/{}", config.branch_prefix, sanitized_identifier)
}

fn git_branch_exists(repo: &str, branch_name: &str) -> Result<bool> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(repo)
        .arg("show-ref")
        .arg("--verify")
        .arg("--quiet")
        .arg(format!("refs/heads/{branch_name}"));
    let output = command.output().map_err(SymphonyError::Io)?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => git_output_error(output, "workspace branch existence check"),
    }
}

fn refresh_existing_workspace_from_clone_branch(
    workspace: &Path,
    config: &WorkspaceConfig,
    refresh_policy: ExistingWorkspaceRefreshPolicy,
) -> Result<Option<WorkspaceRefreshNotice>> {
    if config.strategy != WorkspaceRepoStrategy::Worktree {
        return Ok(None);
    }

    let Some(clone_branch) = config.clone_branch.as_deref() else {
        return Ok(None);
    };

    ensure_symphony_skill_ignore(workspace)?;

    let clone_commit = git_rev_parse(workspace, clone_branch, "workspace clone_branch lookup")?;
    if git_is_ancestor(
        workspace,
        &clone_commit,
        "HEAD",
        "workspace freshness check",
    )? {
        return Ok(None);
    }

    let dirty_status = git_dirty_status(workspace)?;
    let workspace_head = git_rev_parse(workspace, "HEAD", "workspace HEAD lookup")?;

    if let Some(status) = dirty_status.as_deref() {
        if refresh_policy == ExistingWorkspaceRefreshPolicy::AllowStale {
            return Ok(Some(WorkspaceRefreshNotice {
                clone_branch: clone_branch.to_string(),
                workspace_head,
                clone_branch_head: clone_commit,
                dirty_status: Some(status.to_string()),
                reason: "the workspace has local changes and is behind the base branch".to_string(),
            }));
        }

        return Err(SymphonyError::WorkspaceError(format!(
            "workspace stale: local changes block refresh from clone_branch `{clone_branch}`; rebase manually before retrying: {}; changes: {status}",
            workspace.display()
        )));
    }

    if !git_is_ancestor(
        workspace,
        "HEAD",
        &clone_commit,
        "workspace fast-forward check",
    )? {
        if refresh_policy == ExistingWorkspaceRefreshPolicy::AllowStale {
            return Ok(Some(WorkspaceRefreshNotice {
                clone_branch: clone_branch.to_string(),
                workspace_head,
                clone_branch_head: clone_commit,
                dirty_status: None,
                reason: "the workspace has local commits or has diverged from the base branch"
                    .to_string(),
            }));
        }

        return Err(SymphonyError::WorkspaceError(format!(
            "workspace stale: local commits or divergence block refresh from clone_branch `{clone_branch}`; rebase manually before retrying: {}",
            workspace.display()
        )));
    }

    let mut merge_cmd = Command::new("git");
    merge_cmd
        .arg("-C")
        .arg(workspace)
        .arg("merge")
        .arg("--ff-only")
        .arg(&clone_commit);
    run_git_command(merge_cmd, "workspace clone_branch fast-forward")?;

    tracing::info!(
        workspace = %workspace.display(),
        clone_branch,
        clone_commit,
        "fast-forwarded existing workspace from clone_branch"
    );

    Ok(None)
}

fn ensure_symphony_skill_ignore(workspace: &Path) -> Result<()> {
    let mut git_path_cmd = Command::new("git");
    git_path_cmd
        .arg("-C")
        .arg(workspace)
        .arg("rev-parse")
        .arg("--git-path")
        .arg("info/exclude");
    let output = git_path_cmd.output().map_err(SymphonyError::Io)?;
    if !output.status.success() {
        tracing::debug!(
            workspace = %workspace.display(),
            "workspace is not a git checkout; skipping Symphony skill exclude"
        );
        return Ok(());
    }

    let raw_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if raw_path.is_empty() {
        return Ok(());
    }

    let exclude_path = {
        let candidate = PathBuf::from(raw_path);
        if candidate.is_absolute() {
            candidate
        } else {
            workspace.join(candidate)
        }
    };

    let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
    if existing
        .lines()
        .map(str::trim)
        .any(|line| line == SYMPHONY_INJECTED_SKILL_IGNORE)
    {
        return Ok(());
    }

    if let Some(parent) = exclude_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut next = existing;
    if !next.is_empty() && !next.ends_with('\n') {
        next.push('\n');
    }
    next.push_str(SYMPHONY_INJECTED_SKILL_IGNORE);
    next.push('\n');
    std::fs::write(&exclude_path, next)?;
    Ok(())
}

fn git_rev_parse(workspace: &Path, rev: &str, context: &str) -> Result<String> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(workspace)
        .arg("rev-parse")
        .arg("--verify")
        .arg(format!("{rev}^{{commit}}"));
    let output = command.output().map_err(SymphonyError::Io)?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    git_output_error(output, context)
}

fn git_is_ancestor(
    workspace: &Path,
    ancestor: &str,
    descendant: &str,
    context: &str,
) -> Result<bool> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(workspace)
        .arg("merge-base")
        .arg("--is-ancestor")
        .arg(ancestor)
        .arg(descendant);
    let output = command.output().map_err(SymphonyError::Io)?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => git_output_error(output, context),
    }
}

fn git_dirty_status(workspace: &Path) -> Result<Option<String>> {
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(workspace)
        .arg("status")
        .arg("--porcelain=v1")
        .arg("--untracked-files=normal");
    let output = command.output().map_err(SymphonyError::Io)?;
    if !output.status.success() {
        return git_output_error(output, "workspace dirty status check");
    }

    let status = String::from_utf8_lossy(&output.stdout);
    let summary = status
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(5)
        .collect::<Vec<_>>()
        .join("; ");

    Ok((!summary.is_empty()).then_some(summary))
}

/// Inject skills from a `skills/` directory (sibling to the WORKFLOW.md file)
/// into `.agents/skills/` inside the workspace.
///
/// This is a convention-based, zero-config mechanism: if `<workflow_dir>/skills/`
/// exists, its contents are copied into `<workspace>/.agents/skills/`. Each
/// subdirectory in `skills/` becomes a skill directory in the workspace.
///
/// The copy is idempotent — existing files in `.agents/skills/` are preserved.
/// Only new skill directories (or updated files within them) are written.
/// This avoids clobbering skills that already exist in the target repo's
/// `.agents/skills/` directory.
pub fn inject_skills(workflow_dir: &Path, workspace: &Path) -> Result<()> {
    let source_skills = workflow_dir.join("skills");
    if !source_skills.is_dir() {
        tracing::debug!(
            workflow_dir = %workflow_dir.display(),
            source = %source_skills.display(),
            "no skills/ directory found; skipping injection"
        );
        return Ok(());
    }

    ensure_symphony_skill_ignore(workspace)?;

    let target_skills = workspace.join(".agents").join("skills");

    let entries = std::fs::read_dir(&source_skills).map_err(|err| {
        SymphonyError::WorkspaceError(format!(
            "failed to read skills directory {}: {err}",
            source_skills.display()
        ))
    })?;

    let mut injected_count: u32 = 0;
    let mut injected_names: Vec<String> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|err| {
            SymphonyError::WorkspaceError(format!("failed to read skills entry: {err}"))
        })?;

        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        let skill_name = entry.file_name();
        let target_skill_dir = target_skills.join(&skill_name);

        replace_dir_recursive(&entry_path, &target_skill_dir)?;
        injected_count += 1;
        injected_names.push(skill_name.to_string_lossy().to_string());
    }

    injected_names.sort();
    tracing::info!(
        source = %source_skills.display(),
        target = %target_skills.display(),
        count = injected_count,
        skills = %injected_names.join(", "),
        workspace = %workspace.display(),
        "injected skills into workspace"
    );

    Ok(())
}

/// Replace a target directory with the source directory tree.
///
/// Symphony-injected skills are runtime scaffolding, not worker-owned source.
/// Replacing the whole `sym-*` skill directory on each dispatch prevents stale
/// scripts from surviving when files are removed or renamed upstream.
fn replace_dir_recursive(source: &Path, target: &Path) -> Result<()> {
    if target.exists() {
        std::fs::remove_dir_all(target).map_err(|err| {
            SymphonyError::WorkspaceError(format!(
                "failed to remove existing injected skill directory {}: {err}",
                target.display()
            ))
        })?;
    }

    copy_dir_recursive(source, target)
}

/// Recursively copy a directory tree. Creates target dirs as needed.
fn copy_dir_recursive(source: &Path, target: &Path) -> Result<()> {
    std::fs::create_dir_all(target).map_err(|err| {
        SymphonyError::WorkspaceError(format!(
            "failed to create directory {}: {err}",
            target.display()
        ))
    })?;

    let entries = std::fs::read_dir(source).map_err(|err| {
        SymphonyError::WorkspaceError(format!(
            "failed to read directory {}: {err}",
            source.display()
        ))
    })?;

    for entry in entries {
        let entry = entry.map_err(|err| {
            SymphonyError::WorkspaceError(format!("failed to read directory entry: {err}"))
        })?;

        let src_path = entry.path();
        let dst_path = target.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|err| {
                SymphonyError::WorkspaceError(format!(
                    "failed to copy {} -> {}: {err}",
                    src_path.display(),
                    dst_path.display()
                ))
            })?;
        }
    }

    Ok(())
}

/// Bootstrap repository inside a Docker container.
pub async fn docker_bootstrap_repository(
    container_id: &str,
    config: &WorkspaceConfig,
    issue_identifier: &str,
) -> Result<()> {
    let repo = config.repo.as_deref().ok_or_else(|| {
        SymphonyError::InvalidWorkflowConfig("workspace.repo required for docker isolation".into())
    })?;

    let strategy = match config.strategy {
        WorkspaceRepoStrategy::Auto => {
            if repo_is_remote(repo) {
                WorkspaceRepoStrategy::CloneRemote
            } else {
                WorkspaceRepoStrategy::CloneLocal
            }
        }
        other => other,
    };

    match strategy {
        WorkspaceRepoStrategy::CloneRemote => {}
        WorkspaceRepoStrategy::CloneLocal => {
            return Err(SymphonyError::InvalidWorkflowConfig(
                "workspace.git_strategy 'clone-local' is not supported with workspace.isolation 'docker'"
                    .to_string(),
            ));
        }
        WorkspaceRepoStrategy::Worktree => {
            return Err(SymphonyError::InvalidWorkflowConfig(
                "workspace.git_strategy 'worktree' is not supported with workspace.isolation 'docker'"
                    .to_string(),
            ));
        }
        WorkspaceRepoStrategy::Auto => unreachable!("auto strategy is resolved above"),
    }

    let branch_name = branch_name_for_issue(config, issue_identifier);

    let clone_cmd = if let Some(clone_branch) = config.clone_branch.as_deref() {
        format!(
            "git clone --single-branch --branch {} {} /workspace && cd /workspace && git checkout -b {}",
            crate::ssh::shell_escape(clone_branch),
            crate::ssh::shell_escape(repo),
            crate::ssh::shell_escape(&branch_name),
        )
    } else {
        format!(
            "git clone {} /workspace && cd /workspace && git checkout -b {}",
            crate::ssh::shell_escape(repo),
            crate::ssh::shell_escape(&branch_name),
        )
    };

    docker::exec_in_container(container_id, &clone_cmd)
        .await
        .map_err(redact_docker_container_error)?;
    Ok(())
}

/// Run a hook command inside a Docker container.
pub async fn run_hook_in_container(
    hook_name: &str,
    container_id: &str,
    hook_cmd: &str,
    issue: &Issue,
    timeout_ms: u64,
) -> Result<()> {
    let command = format!(
        "cd /workspace && SYMPHONY_ISSUE_ID={} SYMPHONY_ISSUE_IDENTIFIER={} SYMPHONY_ISSUE_TITLE={} SYMPHONY_WORKSPACE_PATH=/workspace sh -lc {}",
        crate::ssh::shell_escape(&issue.id),
        crate::ssh::shell_escape(&issue.identifier),
        crate::ssh::shell_escape(&issue.title),
        crate::ssh::shell_escape(hook_cmd),
    );

    let mut child = docker::exec_command(container_id, &command);
    child
        .kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let output = tokio::time::timeout(Duration::from_millis(timeout_ms), child.output())
        .await
        .map_err(|_| SymphonyError::WorkspaceHookTimeout {
            hook: hook_name.to_string(),
            timeout_ms,
        })?
        .map_err(|err| {
            redact_docker_container_error(SymphonyError::DockerContainerFailed(err.to_string()))
        })?;

    if output.status.success() {
        Ok(())
    } else {
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        tracing::warn!(
            hook = %hook_name,
            container_id = %container_id,
            status = output.status.code().unwrap_or(-1),
            output = %truncate_output(&combined, 2048),
            "docker hook failed"
        );
        Err(SymphonyError::WorkspaceHookFailed {
            hook: hook_name.to_string(),
            status: output.status.code().unwrap_or(-1),
        })
    }
}

fn redact_docker_container_error(err: SymphonyError) -> SymphonyError {
    match err {
        SymphonyError::DockerContainerFailed(message) => {
            SymphonyError::DockerContainerFailed(redact_url_credentials(&message))
        }
        other => other,
    }
}

/// Remove a worktree checkout from the source repository.
fn cleanup_worktree_checkout(workspace: &Path, config: &WorkspaceConfig) -> Result<()> {
    if config.strategy != WorkspaceRepoStrategy::Worktree {
        return Ok(());
    }

    let Some(repo) = config.repo.as_deref() else {
        return Ok(());
    };

    let workspace_str = workspace.to_string_lossy().to_string();
    let mut worktree_remove = Command::new("git");
    worktree_remove
        .arg("-C")
        .arg(repo)
        .arg("worktree")
        .arg("remove")
        .arg("--force")
        .arg(&workspace_str);
    run_git_command(worktree_remove, "workspace worktree cleanup")
}

fn run_git_command(mut command: Command, context: &str) -> Result<()> {
    let output = command.output().map_err(SymphonyError::Io)?;
    if output.status.success() {
        return Ok(());
    }

    git_output_error(output, context)
}

fn git_output_error<T>(output: std::process::Output, context: &str) -> Result<T> {
    let status = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}");
    let redacted = redact_url_credentials(&combined);
    let truncated = truncate_output(&redacted, 2048);

    Err(SymphonyError::Other(format!(
        "{context} failed (status {status}): {truncated}"
    )))
}

/// Run a hook command via `sh -lc` in the workspace directory with a timeout.
fn run_hook(
    name: &str,
    command: &str,
    workspace: &Path,
    timeout_ms: u64,
    issue: &HookIssueContext,
) -> Result<()> {
    tracing::info!(
        hook = name,
        workspace = %workspace.display(),
        "Running workspace hook"
    );

    #[cfg(unix)]
    use std::os::unix::process::CommandExt;

    let workspace_path = workspace.to_string_lossy().to_string();
    let mut cmd = Command::new("sh");
    cmd.args(["-lc", command])
        .current_dir(workspace)
        .env("SYMPHONY_ISSUE_ID", &issue.issue_id)
        .env("SYMPHONY_ISSUE_IDENTIFIER", &issue.issue_identifier)
        .env("SYMPHONY_ISSUE_TITLE", &issue.issue_title)
        .env("SYMPHONY_WORKSPACE_PATH", &workspace_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    // Create a new process group so kill(-pid, SIGKILL) reliably kills
    // the shell and all its children on timeout.
    #[cfg(unix)]
    cmd.process_group(0);

    let child = cmd.spawn().map_err(SymphonyError::Io)?;

    let timeout = Duration::from_millis(timeout_ms);
    #[cfg(unix)]
    let child_id = child.id();

    // Use a channel: the wait thread sends the result, main thread waits with timeout
    let (tx, rx) = std::sync::mpsc::channel();

    let wait_thread = std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(timeout) {
        Ok(Ok(output)) => {
            let _ = wait_thread.join();
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{}{}", stdout, stderr);
            let truncated = truncate_output(&combined, 2048);

            if output.status.success() {
                Ok(())
            } else {
                let status = output.status.code().unwrap_or(-1);
                tracing::warn!(
                    hook = name,
                    status = status,
                    output = %truncated,
                    workspace = %workspace.display(),
                    "Workspace hook failed"
                );
                Err(SymphonyError::WorkspaceHookFailed {
                    hook: name.to_string(),
                    status,
                })
            }
        }
        Ok(Err(e)) => {
            let _ = wait_thread.join();
            Err(SymphonyError::Io(e))
        }
        Err(_timeout) => {
            // Kill the process group via SIGKILL
            // Kill the process by PID using kill(2).
            // Safety: child_id is a valid PID from a process we spawned.
            #[cfg(unix)]
            unsafe {
                let pid = child_id as i32;
                // Kill the process group (negative PID) to catch shell children too
                let _ = libc_kill(-pid, 9);
                // Also kill the direct child in case it's not a process group leader
                let _ = libc_kill(pid, 9);
            }
            let _ = wait_thread.join();

            tracing::warn!(
                hook = name,
                timeout_ms = timeout_ms,
                workspace = %workspace.display(),
                "Workspace hook timed out"
            );
            Err(SymphonyError::WorkspaceHookTimeout {
                hook: name.to_string(),
                timeout_ms,
            })
        }
    }
}

/// Send a signal to a process. Wrapper around the kill(2) syscall.
#[cfg(unix)]
unsafe fn libc_kill(pid: i32, sig: i32) -> i32 {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe { kill(pid, sig) }
}

/// Run the `before_run` hook — failure is fatal.
pub fn run_before_run_hook(workspace: &Path, hooks: &HooksConfig) -> Result<()> {
    run_before_run_hook_internal(workspace, hooks, None)
}

/// Issue-aware variant that injects full issue metadata into hook env vars.
pub fn run_before_run_hook_for_issue(
    workspace: &Path,
    hooks: &HooksConfig,
    issue: &Issue,
) -> Result<()> {
    run_before_run_hook_internal(workspace, hooks, Some(issue))
}

fn run_before_run_hook_internal(
    workspace: &Path,
    hooks: &HooksConfig,
    issue: Option<&Issue>,
) -> Result<()> {
    if let Some(ref command) = hooks.before_run {
        let fallback_identifier = workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        let hook_issue = HookIssueContext::from_issue_or_identifier(issue, fallback_identifier);
        run_hook(
            "before_run",
            command,
            workspace,
            hooks.timeout_ms,
            &hook_issue,
        )
    } else {
        Ok(())
    }
}

/// Run the `after_run` hook — failure is logged and ignored.
pub fn run_after_run_hook(workspace: &Path, hooks: &HooksConfig) -> Result<()> {
    run_after_run_hook_internal(workspace, hooks, None)
}

/// Issue-aware variant that injects full issue metadata into hook env vars.
pub fn run_after_run_hook_for_issue(
    workspace: &Path,
    hooks: &HooksConfig,
    issue: &Issue,
) -> Result<()> {
    run_after_run_hook_internal(workspace, hooks, Some(issue))
}

fn run_after_run_hook_internal(
    workspace: &Path,
    hooks: &HooksConfig,
    issue: Option<&Issue>,
) -> Result<()> {
    if let Some(ref command) = hooks.after_run {
        let fallback_identifier = workspace
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        let hook_issue = HookIssueContext::from_issue_or_identifier(issue, fallback_identifier);
        match run_hook(
            "after_run",
            command,
            workspace,
            hooks.timeout_ms,
            &hook_issue,
        ) {
            Ok(()) => Ok(()),
            Err(e) => {
                tracing::warn!(error = %e, "after_run hook failure ignored");
                Ok(())
            }
        }
    } else {
        Ok(())
    }
}

/// Remove a workspace directory. Runs `before_remove` hook (failure ignored).
pub fn remove_workspace(
    workspace: &Path,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<()> {
    remove_workspace_internal(workspace, config, hooks, None)
}

/// Issue-aware variant that injects full issue metadata into hook env vars.
pub fn remove_workspace_for_issue(
    workspace: &Path,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
    issue: &Issue,
) -> Result<()> {
    remove_workspace_internal(workspace, config, hooks, Some(issue))
}

fn remove_workspace_internal(
    workspace: &Path,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
    issue: Option<&Issue>,
) -> Result<()> {
    let canonical_root = path_safety::canonicalize(Path::new(&config.root))?;

    if workspace.exists() {
        validate_workspace_path(workspace, &canonical_root)?;
        let canonical_workspace = path_safety::canonicalize(workspace)?;

        // Run before_remove hook (failure ignored)
        if let Some(ref command) = hooks.before_remove {
            if canonical_workspace.is_dir() {
                let fallback_identifier = canonical_workspace
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("");
                let hook_issue =
                    HookIssueContext::from_issue_or_identifier(issue, fallback_identifier);
                match run_hook(
                    "before_remove",
                    command,
                    &canonical_workspace,
                    hooks.timeout_ms,
                    &hook_issue,
                ) {
                    Ok(()) => {}
                    Err(e) => {
                        tracing::warn!(error = %e, "before_remove hook failure ignored");
                    }
                }
            }
        }

        if let Err(err) = cleanup_worktree_checkout(&canonical_workspace, config) {
            tracing::warn!(
                error = %err,
                workspace = %canonical_workspace.display(),
                "worktree cleanup failed; continuing workspace directory removal"
            );
        }

        if canonical_workspace.exists() {
            std::fs::remove_dir_all(&canonical_workspace)?;
        }
    }

    Ok(())
}

/// Truncate output to max_bytes, appending "... (truncated)" if necessary.
fn truncate_output(output: &str, max_bytes: usize) -> String {
    if output.len() <= max_bytes {
        output.to_string()
    } else {
        // Find a safe UTF-8 boundary
        let truncated = &output[..output.floor_char_boundary(max_bytes)];
        format!("{}... (truncated)", truncated)
    }
}

#[cfg(test)]
mod tests {
    use super::{inject_skills, scan_workspace_root};

    #[test]
    fn scan_workspace_root_maps_matching_directories() {
        let temp = tempfile::tempdir().expect("tempdir should be created");
        let root = temp.path();

        let matching_a = root.join("KAT-100");
        let matching_b = root.join("KAT-200");
        let non_matching = root.join("not-an-issue");

        std::fs::create_dir_all(&matching_a).expect("matching workspace A should be created");
        std::fs::create_dir_all(&matching_b).expect("matching workspace B should be created");
        std::fs::create_dir_all(&non_matching).expect("non-matching directory should exist");

        let discovered = scan_workspace_root(root, "symphony");
        let expected_a = std::fs::canonicalize(&matching_a).expect("canonical path should resolve");
        let expected_b = std::fs::canonicalize(&matching_b).expect("canonical path should resolve");

        assert_eq!(discovered.len(), 2);
        assert_eq!(discovered.get("KAT-100"), Some(&expected_a));
        assert_eq!(discovered.get("KAT-200"), Some(&expected_b));
    }

    #[test]
    fn scan_workspace_root_supports_nested_branch_prefix() {
        let temp = tempfile::tempdir().expect("tempdir should be created");
        let root = temp.path();

        let nested_match = root.join("symphony").join("backend").join("KAT-900");
        std::fs::create_dir_all(&nested_match)
            .expect("nested branch prefix workspace should be created");

        let discovered = scan_workspace_root(root, "symphony/backend");
        let expected = std::fs::canonicalize(&nested_match).expect("canonical path should resolve");
        assert_eq!(discovered.get("KAT-900"), Some(&expected));
    }

    #[test]
    fn scan_workspace_root_falls_back_to_root_when_prefix_missing() {
        let temp = tempfile::tempdir().expect("tempdir should be created");
        let root = temp.path();

        let root_match = root.join("KAT-321");
        std::fs::create_dir_all(&root_match).expect("root workspace should be created");

        let discovered = scan_workspace_root(root, "symphony");
        let expected = std::fs::canonicalize(&root_match).expect("canonical path should resolve");
        assert_eq!(discovered.get("KAT-321"), Some(&expected));
    }

    // ── inject_skills tests ────────────────────────────────────────────

    #[test]
    fn inject_skills_copies_skill_dirs_into_agents_skills() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        // Create source skills
        let skill_dir = workflow_dir.join("skills").join("sym-land");
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: sym-land\n---\n# Land",
        )
        .unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        let target = workspace
            .join(".agents")
            .join("skills")
            .join("sym-land")
            .join("SKILL.md");
        assert!(target.exists(), "skill should be copied to .agents/skills/");
        let content = std::fs::read_to_string(&target).unwrap();
        assert!(content.contains("sym-land"));
    }

    #[test]
    fn inject_skills_copies_nested_scripts() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        let skill_dir = workflow_dir.join("skills").join("sym-fix-ci");
        let scripts_dir = skill_dir.join("scripts");
        std::fs::create_dir_all(&scripts_dir).unwrap();
        std::fs::write(skill_dir.join("SKILL.md"), "---\nname: sym-fix-ci\n---").unwrap();
        std::fs::write(scripts_dir.join("inspect.py"), "#!/usr/bin/env python3").unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        let target_script = workspace
            .join(".agents")
            .join("skills")
            .join("sym-fix-ci")
            .join("scripts")
            .join("inspect.py");
        assert!(target_script.exists(), "nested scripts should be copied");
    }

    #[test]
    fn inject_skills_noop_when_no_skills_dir() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        // No skills/ directory — should be a no-op
        inject_skills(&workflow_dir, &workspace).unwrap();

        assert!(
            !workspace.join(".agents").exists(),
            ".agents should not be created"
        );
    }

    #[test]
    fn inject_skills_preserves_existing_repo_skills() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        // Pre-existing skill in the workspace (from the cloned repo)
        let existing_skill = workspace.join(".agents").join("skills").join("repo-custom");
        std::fs::create_dir_all(&existing_skill).unwrap();
        std::fs::write(
            existing_skill.join("SKILL.md"),
            "---\nname: repo-custom\n---",
        )
        .unwrap();

        // Symphony skill to inject
        let sym_skill = workflow_dir.join("skills").join("sym-commit");
        std::fs::create_dir_all(&sym_skill).unwrap();
        std::fs::write(sym_skill.join("SKILL.md"), "---\nname: sym-commit\n---").unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        // Both should exist
        assert!(
            workspace
                .join(".agents")
                .join("skills")
                .join("repo-custom")
                .join("SKILL.md")
                .exists(),
            "existing repo skill should be preserved"
        );
        assert!(
            workspace
                .join(".agents")
                .join("skills")
                .join("sym-commit")
                .join("SKILL.md")
                .exists(),
            "symphony skill should be injected"
        );
    }

    #[test]
    fn inject_skills_updates_existing_symphony_skill() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        // Pre-existing older version of a symphony skill
        let existing = workspace.join(".agents").join("skills").join("sym-land");
        std::fs::create_dir_all(&existing).unwrap();
        std::fs::write(existing.join("SKILL.md"), "old content").unwrap();

        // Updated version
        let source = workflow_dir.join("skills").join("sym-land");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("SKILL.md"), "new content").unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        let content = std::fs::read_to_string(
            workspace
                .join(".agents")
                .join("skills")
                .join("sym-land")
                .join("SKILL.md"),
        )
        .unwrap();
        assert_eq!(
            content, "new content",
            "skill files should be overwritten on re-injection"
        );
    }

    #[test]
    fn inject_skills_removes_stale_files_from_existing_symphony_skill() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        let existing = workspace.join(".agents").join("skills").join("sym-land");
        std::fs::create_dir_all(existing.join("scripts")).unwrap();
        std::fs::write(existing.join("SKILL.md"), "old content").unwrap();
        std::fs::write(existing.join("scripts").join("stale.py"), "stale").unwrap();

        let source = workflow_dir.join("skills").join("sym-land");
        std::fs::create_dir_all(&source).unwrap();
        std::fs::write(source.join("SKILL.md"), "new content").unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        assert!(
            !workspace
                .join(".agents")
                .join("skills")
                .join("sym-land")
                .join("scripts")
                .join("stale.py")
                .exists(),
            "re-injection should replace sym-* skill directories, not merge stale files"
        );
    }

    #[test]
    fn inject_skills_skips_non_directory_entries() {
        let temp = tempfile::tempdir().expect("tempdir");
        let workflow_dir = temp.path().join("workflow");
        let workspace = temp.path().join("workspace");
        std::fs::create_dir_all(&workflow_dir).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();

        let skills_dir = workflow_dir.join("skills");
        std::fs::create_dir_all(&skills_dir).unwrap();
        // A stray file in skills/ (not a skill directory)
        std::fs::write(skills_dir.join("README.md"), "# skills readme").unwrap();

        // A proper skill
        let skill = skills_dir.join("sym-pull");
        std::fs::create_dir_all(&skill).unwrap();
        std::fs::write(skill.join("SKILL.md"), "---\nname: sym-pull\n---").unwrap();

        inject_skills(&workflow_dir, &workspace).unwrap();

        assert!(
            workspace
                .join(".agents")
                .join("skills")
                .join("sym-pull")
                .join("SKILL.md")
                .exists(),
            "proper skill should be injected"
        );
        assert!(
            !workspace
                .join(".agents")
                .join("skills")
                .join("README.md")
                .exists(),
            "non-directory entries should be skipped"
        );
    }
}
