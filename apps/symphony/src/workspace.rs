//! Workspace manager — creates/reuses per-issue directories, runs lifecycle hooks.
//!
//! Full implementation in S04/T03. This is the public API skeleton so tests compile.

use std::path::Path;
use std::process::Command;

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

    match config.strategy {
        WorkspaceRepoStrategy::Clone => {
            // Keep CLI parity with the proposal: git clone <repo> . --single-branch
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
            run_git_command(clone_cmd, "workspace clone bootstrap")?;

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
    use std::time::Duration;

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
