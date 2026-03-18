//! Workspace manager — creates/reuses per-issue directories, runs lifecycle hooks.
//!
//! Full implementation in S04/T03. This is the public API skeleton so tests compile.

use std::path::Path;

use crate::domain::{HooksConfig, Workspace, WorkspaceConfig};
use crate::error::{Result, SymphonyError};
use crate::path_safety;

/// Create or reuse a workspace directory for the given identifier.
///
/// - Sanitizes the identifier via `path_safety::sanitize_identifier`
/// - Computes the workspace path under `config.root`
/// - Validates that the workspace stays within the root (no symlink escapes)
/// - Creates the directory if missing, reuses if present, replaces non-dirs
/// - Runs the `after_create` hook if the directory was newly created
pub fn ensure_workspace(
    identifier: &str,
    config: &WorkspaceConfig,
    hooks: &HooksConfig,
) -> Result<Workspace> {
    let safe_id = path_safety::sanitize_identifier(identifier);
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

    // Run after_create hook if newly created — clean up on failure
    if created_now {
        if let Some(ref command) = hooks.after_create {
            if let Err(err) = run_hook("after_create", command, &final_path, hooks.timeout_ms) {
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

/// Run a hook command via `sh -lc` in the workspace directory with a timeout.
fn run_hook(name: &str, command: &str, workspace: &Path, timeout_ms: u64) -> Result<()> {
    use std::process::Command;
    use std::time::Duration;

    tracing::info!(
        hook = name,
        workspace = %workspace.display(),
        "Running workspace hook"
    );

    #[cfg(unix)]
    use std::os::unix::process::CommandExt;

    let mut cmd = Command::new("sh");
    cmd.args(["-lc", command])
        .current_dir(workspace)
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
    if let Some(ref command) = hooks.before_run {
        run_hook("before_run", command, workspace, hooks.timeout_ms)
    } else {
        Ok(())
    }
}

/// Run the `after_run` hook — failure is logged and ignored.
pub fn run_after_run_hook(workspace: &Path, hooks: &HooksConfig) -> Result<()> {
    if let Some(ref command) = hooks.after_run {
        match run_hook("after_run", command, workspace, hooks.timeout_ms) {
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
    let canonical_root = path_safety::canonicalize(Path::new(&config.root))?;

    if workspace.exists() {
        validate_workspace_path(workspace, &canonical_root)?;

        // Run before_remove hook (failure ignored)
        if let Some(ref command) = hooks.before_remove {
            if workspace.is_dir() {
                match run_hook("before_remove", command, workspace, hooks.timeout_ms) {
                    Ok(()) => {}
                    Err(e) => {
                        tracing::warn!(error = %e, "before_remove hook failure ignored");
                    }
                }
            }
        }

        std::fs::remove_dir_all(workspace)?;
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
