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
    ensure_workspace_internal(identifier, None, config, hooks)
}

/// Issue-aware variant that injects full issue metadata into hook env vars.
pub fn ensure_workspace_for_issue(
    issue: &Issue,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<Workspace> {
    ensure_workspace_internal(&issue.identifier, Some(issue), config, hooks)
}

fn ensure_workspace_internal(
    identifier: &str,
    issue: Option<&Issue>,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<Workspace> {
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

    Ok(Workspace {
        path: final_path.to_string_lossy().to_string(),
        workspace_key: safe_id,
        created_now,
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

    let branch_name = format!("{}/{}", config.branch_prefix, issue_identifier);
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
            worktree_cmd
                .arg("-C")
                .arg(repo)
                .arg("worktree")
                .arg("add")
                .arg(&workspace_str)
                .arg("-b")
                .arg(&branch_name);
            run_git_command(worktree_cmd, "workspace worktree bootstrap")
        }
        WorkspaceRepoStrategy::Auto => unreachable!("auto strategy must resolve before bootstrap"),
    }
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

        copy_dir_recursive(&entry_path, &target_skill_dir)?;
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

/// Recursively copy a directory tree. Creates target dirs as needed.
/// Overwrites files that already exist (skills may be updated between runs).
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

    let branch_name = format!("{}/{}", config.branch_prefix, issue_identifier);

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
