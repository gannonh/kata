//! Codex app-server client — subprocess lifecycle, handshake, and turn streaming.
//!
//! Ports the Elixir `SymphonyElixir.Codex.AppServer` module to idiomatic Rust.
//!
//! ## Protocol overview
//!
//! 1. Validate workspace cwd against the workspace root.
//! 2. Spawn `bash -lc <codex.command>` with workspace as cwd.
//! 3. Handshake: `initialize(id=1)` → await response → `initialized` → `thread/start(id=2)` → await response.
//! 4. Turn: `turn/start(id=3)` → await response → stream events until `turn/completed` / failure / timeout.
//! 5. Stop: kill subprocess.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use chrono::Utc;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::codex::dynamic_tool;
use crate::domain::{AgentEvent, CodexConfig, Issue};
use crate::error::{Result, SymphonyError};
use crate::path_safety;

// ── Constants ─────────────────────────────────────────────────────────

const INITIALIZE_ID: u64 = 1;
const THREAD_START_ID: u64 = 2;
const TURN_START_ID: u64 = 3;

/// Maximum bytes printed from non-JSON lines in logs.
const MAX_STREAM_LOG_BYTES: usize = 1_000;

// ── Public types ──────────────────────────────────────────────────────

/// Opaque handle to a running Codex app-server subprocess session.
///
/// Holds the subprocess I/O channels and session state needed to run turns.
/// Created by `start_session`; consumed by `stop_session`.
pub struct SessionHandle {
    /// Session identifier.
    ///
    /// Initially set to the `thread_id` returned by the handshake.
    /// Updated to `"<thread_id>-<turn_id>"` format when `run_turn` starts.
    pub session_id: String,

    // ── Subprocess ────────────────────────────────────────────────────
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,

    // ── Session state ─────────────────────────────────────────────────
    thread_id: String,
    /// OS PID of the subprocess as a string (for event metadata).
    pid: Option<String>,

    // ── Issue info (stored for turn/start and logging) ─────────────────
    issue_id: String,
    issue_identifier: String,
    issue_title: String,
    workspace_path: String,

    // ── Policy / timing ───────────────────────────────────────────────
    approval_policy: Value,
    turn_sandbox_policy: Option<Value>,
    turn_timeout_ms: u64,
    read_timeout_ms: u64,
}

/// The outcome of a completed Codex agent turn.
///
/// Contains the turn's event stream, final text, and token accounting.
#[derive(Debug)]
pub struct TurnResult {
    /// Events emitted during the turn, in delivery order.
    pub events: Vec<AgentEvent>,
    /// Final text output from the turn (if any).
    pub output_text: Option<String>,
    /// Total tokens consumed during the turn (input + output).
    pub total_tokens: u64,
}

// ── Public API ────────────────────────────────────────────────────────

/// Launch a Codex app-server subprocess and perform the startup handshake.
///
/// Validates the workspace path, spawns `bash -lc <command>`, performs the
/// JSON-RPC handshake (`initialize` → `initialized` → `thread/start`), and
/// returns a `SessionHandle` on success.
///
/// # Arguments
/// - `config`          — Codex runtime configuration
/// - `issue`           — issue being worked on (stored for turn/start and logging)
/// - `workspace_path`  — path to the workspace directory for this issue
/// - `workspace_root`  — workspace root used to validate containment
///
/// # Errors
/// - `InvalidWorkspaceCwd` — workspace path fails safety checks
/// - `CodexNotFound`       — bash or the configured command does not exist
/// - `ResponseTimeout`     — handshake did not complete in time
/// - `ResponseError`       — subprocess sent an unexpected response
pub async fn start_session(
    config: &CodexConfig,
    issue: &Issue,
    workspace_path: &Path,
    workspace_root: &Path,
) -> Result<SessionHandle> {
    // ── Step 1: Validate workspace cwd ───────────────────────────────
    let canonical_workspace = validate_workspace_cwd(workspace_path, workspace_root)?;
    let workspace_str = canonical_workspace.to_string_lossy().to_string();

    // ── Step 2: Spawn subprocess ──────────────────────────────────────
    let cmd_str = config.command.join(" ");
    tracing::debug!(
        issue_id = %issue.id,
        cmd = %cmd_str,
        cwd = %workspace_str,
        "Spawning Codex app-server"
    );

    let mut child = tokio::process::Command::new("bash")
        .args(["-lc", &cmd_str])
        .current_dir(&canonical_workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                SymphonyError::CodexNotFound
            } else {
                SymphonyError::Io(e)
            }
        })?;

    let pid = child.id().map(|p| p.to_string());
    let mut stdin = child.stdin.take().expect("stdin was piped");
    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    // Spawn a fire-and-forget task that logs stderr output
    tokio::spawn(drain_stderr(stderr));

    let mut stdout_reader = BufReader::new(stdout);

    // ── Step 3: Perform startup handshake ────────────────────────────
    let thread_id = match do_start_session(
        &mut stdin,
        &mut stdout_reader,
        config,
        &workspace_str,
    )
    .await
    {
        Ok(id) => id,
        Err(e) => {
            // Kill the subprocess before propagating the error
            let _ = child.kill().await;
            return Err(e);
        }
    };

    Ok(SessionHandle {
        session_id: thread_id.clone(),
        child,
        stdin,
        stdout_reader,
        thread_id,
        pid,
        issue_id: issue.id.clone(),
        issue_identifier: issue.identifier.clone(),
        issue_title: issue.title.clone(),
        workspace_path: workspace_str,
        approval_policy: config.approval_policy.clone(),
        turn_sandbox_policy: config.turn_sandbox_policy.clone(),
        turn_timeout_ms: config.turn_timeout_ms,
        read_timeout_ms: config.read_timeout_ms,
    })
}

/// Run a single agent turn and stream events via the provided callback.
///
/// Sends `turn/start`, streams line-delimited JSON until the turn completes,
/// fails, or times out. Emits `AgentEvent` variants via `event_callback` for
/// every lifecycle event.
///
/// # Errors
/// - `TurnFailed`    — turn ended with a `turn/failed` message
/// - `TurnCancelled` — turn was cancelled (`turn/cancelled` message)
/// - `TurnTimeout`   — no event received within `turn_timeout_ms`
/// - `PortExit`      — subprocess exited unexpectedly
pub async fn run_turn<F>(
    handle: &mut SessionHandle,
    prompt: &str,
    mut event_callback: F,
) -> Result<TurnResult>
where
    F: FnMut(AgentEvent) + Send,
{
    // ── Send turn/start (id=3) ────────────────────────────────────────
    let title = format!("{}: {}", handle.issue_identifier, handle.issue_title);
    let turn_start_msg = json!({
        "method": "turn/start",
        "id": TURN_START_ID,
        "params": {
            "threadId": handle.thread_id,
            "input": [{"type": "text", "text": prompt}],
            "cwd": handle.workspace_path,
            "title": title,
            "approvalPolicy": handle.approval_policy,
            "sandboxPolicy": handle.turn_sandbox_policy
        }
    });
    send_message(&mut handle.stdin, &turn_start_msg).await?;

    // ── Await turn/start response, extract turn_id ────────────────────
    let turn_result =
        await_response(&mut handle.stdout_reader, TURN_START_ID, handle.read_timeout_ms).await?;

    let turn_id = turn_result
        .get("turn")
        .and_then(|t| t.get("id"))
        .and_then(|id| id.as_str())
        .ok_or_else(|| {
            SymphonyError::ResponseError(format!(
                "turn/start response missing turn.id: {:?}",
                turn_result
            ))
        })?
        .to_string();

    // ── Update session_id and emit SessionStarted ─────────────────────
    let session_id = format!("{}-{}", handle.thread_id, turn_id);
    handle.session_id = session_id.clone();

    tracing::info!(
        issue_id = %handle.issue_id,
        issue_identifier = %handle.issue_identifier,
        session_id = %session_id,
        "Codex session started"
    );

    let session_started = AgentEvent::SessionStarted {
        timestamp: Utc::now(),
        codex_app_server_pid: handle.pid.clone(),
        session_id: session_id.clone(),
    };
    event_callback(session_started.clone());

    let mut events = vec![session_started];

    // ── Receive loop ──────────────────────────────────────────────────
    loop {
        let mut line = String::new();

        let read_result = tokio::time::timeout(
            Duration::from_millis(handle.turn_timeout_ms),
            handle.stdout_reader.read_line(&mut line),
        )
        .await;

        match read_result {
            // ── Timeout ──────────────────────────────────────────────
            Err(_elapsed) => {
                tracing::warn!(
                    issue_id = %handle.issue_id,
                    session_id = %session_id,
                    turn_timeout_ms = handle.turn_timeout_ms,
                    "Codex turn timed out"
                );
                return Err(SymphonyError::TurnTimeout);
            }

            // ── I/O error ─────────────────────────────────────────────
            Ok(Err(e)) => return Err(SymphonyError::Io(e)),

            // ── EOF — subprocess exited ───────────────────────────────
            Ok(Ok(0)) => {
                let status = tokio::time::timeout(
                    Duration::from_secs(5),
                    handle.child.wait(),
                )
                .await
                .ok()
                .and_then(|r| r.ok())
                .and_then(|s| s.code())
                .unwrap_or(-1);

                tracing::warn!(
                    issue_id = %handle.issue_id,
                    session_id = %session_id,
                    exit_status = status,
                    "Codex subprocess exited during turn"
                );

                return Err(SymphonyError::PortExit(status));
            }

            // ── Got a line ────────────────────────────────────────────
            Ok(Ok(_n)) => {
                let text = line.trim_end_matches(['\n', '\r']).to_string();
                if text.is_empty() {
                    continue;
                }

                match serde_json::from_str::<Value>(&text) {
                    // ── Valid JSON ────────────────────────────────────
                    Ok(payload) => {
                        let method = payload
                            .get("method")
                            .and_then(|m| m.as_str())
                            .map(|s| s.to_string());

                        match method.as_deref() {
                            // ── turn/completed ────────────────────────
                            Some("turn/completed") => {
                                let event = AgentEvent::TurnCompleted {
                                    timestamp: Utc::now(),
                                    codex_app_server_pid: handle.pid.clone(),
                                    turn_id: turn_id.clone(),
                                    message: None,
                                };
                                event_callback(event.clone());
                                events.push(event);

                                tracing::info!(
                                    issue_id = %handle.issue_id,
                                    issue_identifier = %handle.issue_identifier,
                                    session_id = %session_id,
                                    "Codex session completed"
                                );

                                return Ok(TurnResult {
                                    events,
                                    output_text: None,
                                    total_tokens: 0,
                                });
                            }

                            // ── turn/failed ───────────────────────────
                            Some("turn/failed") => {
                                let params =
                                    payload.get("params").cloned().unwrap_or(Value::Null);
                                let error_msg = serde_json::to_string(&params)
                                    .unwrap_or_else(|_| format!("{params:?}"));

                                let event = AgentEvent::TurnFailed {
                                    timestamp: Utc::now(),
                                    codex_app_server_pid: handle.pid.clone(),
                                    turn_id: turn_id.clone(),
                                    error: error_msg.clone(),
                                };
                                event_callback(event.clone());
                                events.push(event);

                                tracing::warn!(
                                    issue_id = %handle.issue_id,
                                    session_id = %session_id,
                                    error = %error_msg,
                                    "Codex turn failed"
                                );

                                return Err(SymphonyError::TurnFailed(error_msg));
                            }

                            // ── turn/cancelled ────────────────────────
                            Some("turn/cancelled") => {
                                let params =
                                    payload.get("params").cloned().unwrap_or(Value::Null);
                                let reason = serde_json::to_string(&params)
                                    .unwrap_or_else(|_| format!("{params:?}"));

                                let event = AgentEvent::TurnCancelled {
                                    timestamp: Utc::now(),
                                    codex_app_server_pid: handle.pid.clone(),
                                    turn_id: turn_id.clone(),
                                };
                                event_callback(event.clone());
                                events.push(event);

                                tracing::warn!(
                                    issue_id = %handle.issue_id,
                                    session_id = %session_id,
                                    "Codex turn cancelled"
                                );

                                return Err(SymphonyError::TurnCancelled(reason));
                            }

                            // ── Other method (notification) ───────────
                            Some(other_method) => {
                                tracing::debug!("Codex notification: {:?}", other_method);
                                let event = AgentEvent::Notification {
                                    timestamp: Utc::now(),
                                    codex_app_server_pid: handle.pid.clone(),
                                    message: text
                                        .chars()
                                        .take(MAX_STREAM_LOG_BYTES)
                                        .collect(),
                                };
                                event_callback(event.clone());
                                events.push(event);
                            }

                            // ── JSON without method ───────────────────
                            None => {
                                let event = AgentEvent::OtherMessage {
                                    timestamp: Utc::now(),
                                    codex_app_server_pid: handle.pid.clone(),
                                    raw: payload,
                                };
                                event_callback(event.clone());
                                events.push(event);
                            }
                        }
                    }

                    // ── Non-JSON line ─────────────────────────────────
                    Err(parse_err) => {
                        log_non_json_line(&text, "turn stream");
                        let event = AgentEvent::Malformed {
                            timestamp: Utc::now(),
                            codex_app_server_pid: handle.pid.clone(),
                            raw_text: text,
                            parse_error: parse_err.to_string(),
                        };
                        event_callback(event.clone());
                        events.push(event);
                    }
                }
            }
        }
    }
}

/// Gracefully stop a Codex app-server session.
///
/// Closes stdin (signals EOF to the subprocess), kills it if still running,
/// and waits for it to exit. Consumes the `SessionHandle`.
pub async fn stop_session(mut handle: SessionHandle) -> Result<()> {
    // Drop stdin to signal EOF
    drop(handle.stdin);
    // Kill in case the process ignores the EOF
    let _ = handle.child.kill().await;
    let _ = handle.child.wait().await;
    Ok(())
}

// ── Workspace cwd validation ──────────────────────────────────────────

/// Validate that `workspace_path` is a legitimate subdirectory of `workspace_root`.
///
/// Rejects:
/// - workspace == root (identical canonical paths)
/// - workspace outside root (canonical path not under root)
/// - symlink escape (canonical path outside root, but non-resolved path appears inside)
///
/// Returns the canonicalized workspace path on success.
fn validate_workspace_cwd(workspace_path: &Path, workspace_root: &Path) -> Result<PathBuf> {
    let canonical_workspace = path_safety::canonicalize(workspace_path)?;
    let canonical_root = path_safety::canonicalize(workspace_root)?;

    // Expand without symlink resolution for escape detection
    let expanded_workspace = expand_path_no_symlinks(workspace_path);
    let expanded_root = expand_path_no_symlinks(workspace_root);

    // ── Check 1: workspace IS the root ───────────────────────────────
    if canonical_workspace == canonical_root {
        return Err(SymphonyError::InvalidWorkspaceCwd(format!(
            "workspace is the workspace root: {}",
            canonical_workspace.display()
        )));
    }

    // ── Check 2: canonical path is properly under root ────────────────
    // `Path::starts_with` checks component boundaries, so /tmp/abc does NOT
    // match /tmp/a, but /tmp/a/b does match /tmp/a.
    if canonical_workspace.starts_with(&canonical_root) {
        return Ok(canonical_workspace);
    }

    // ── Check 3: symlink escape ───────────────────────────────────────
    // The non-resolved path is under root, but the canonical path is not.
    // This means a symlink inside the root points outside it.
    if expanded_workspace.starts_with(&expanded_root) && expanded_workspace != expanded_root {
        return Err(SymphonyError::InvalidWorkspaceCwd(format!(
            "symlink escape: {} resolves outside workspace root {}",
            workspace_path.display(),
            canonical_root.display()
        )));
    }

    // ── Check 4: completely outside root ─────────────────────────────
    Err(SymphonyError::InvalidWorkspaceCwd(format!(
        "workspace {} is outside root {}",
        canonical_workspace.display(),
        canonical_root.display()
    )))
}

/// Return the absolute, `.`/`..`-normalized path WITHOUT following symlinks.
fn expand_path_no_symlinks(path: &Path) -> PathBuf {
    let abs = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_default().join(path)
    };

    let mut normalized = PathBuf::new();
    for component in abs.components() {
        match component {
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            std::path::Component::CurDir => {}
            c => normalized.push(c),
        }
    }
    normalized
}

// ── I/O helpers ───────────────────────────────────────────────────────

/// JSON-encode `message`, append a newline, and write to subprocess stdin.
async fn send_message(
    stdin: &mut tokio::process::ChildStdin,
    message: &Value,
) -> Result<()> {
    let encoded = serde_json::to_string(message)
        .map_err(|e| SymphonyError::Other(format!("json_encode_failed: {e}")))?;
    let line = format!("{encoded}\n");
    stdin.write_all(line.as_bytes()).await?;
    stdin.flush().await?;
    Ok(())
}

/// Read lines from `reader` until a JSON response with `request_id` is found.
///
/// Each `read_line` call is wrapped in `tokio::time::timeout(timeout_ms)`.
/// Non-matching JSON messages are skipped (logged at DEBUG).
/// Non-JSON lines are logged and skipped.
/// Returns the `result` field of the matching response on success.
async fn await_response(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    request_id: u64,
    timeout_ms: u64,
) -> Result<Value> {
    loop {
        let mut line = String::new();

        let read_result = tokio::time::timeout(
            Duration::from_millis(timeout_ms),
            reader.read_line(&mut line),
        )
        .await;

        match read_result {
            Err(_elapsed) => return Err(SymphonyError::ResponseTimeout),
            Ok(Err(e)) => return Err(SymphonyError::Io(e)),
            Ok(Ok(0)) => {
                return Err(SymphonyError::ResponseError(
                    "subprocess exited during handshake".to_string(),
                ));
            }
            Ok(Ok(_n)) => {
                let text = line.trim_end_matches(['\n', '\r']).to_string();
                if text.is_empty() {
                    continue;
                }

                match serde_json::from_str::<Value>(&text) {
                    Ok(payload) => {
                        let id = payload.get("id").and_then(|v| v.as_u64());

                        if id == Some(request_id) {
                            // Found the response we were waiting for
                            if let Some(error) = payload.get("error") {
                                return Err(SymphonyError::ResponseError(
                                    serde_json::to_string(error)
                                        .unwrap_or_else(|_| format!("{error:?}")),
                                ));
                            }
                            if let Some(result) = payload.get("result") {
                                return Ok(result.clone());
                            }
                            return Err(SymphonyError::ResponseError(format!(
                                "response for id={request_id} has no result field: {text}"
                            )));
                        }

                        // Different ID — ignore and keep reading
                        tracing::debug!(
                            "Ignoring message while waiting for response id={}: {}",
                            request_id,
                            text.chars().take(200).collect::<String>()
                        );
                    }
                    Err(_) => {
                        // Non-JSON — log and keep reading
                        log_non_json_line(&text, "response stream");
                    }
                }
            }
        }
    }
}

// ── Handshake ─────────────────────────────────────────────────────────

/// Perform the full startup handshake and return the `thread_id`.
///
/// Order: `initialize(id=1)` → await → `initialized` (no id) → `thread/start(id=2)` → await.
async fn do_start_session(
    stdin: &mut tokio::process::ChildStdin,
    reader: &mut BufReader<tokio::process::ChildStdout>,
    config: &CodexConfig,
    workspace_path: &str,
) -> Result<String> {
    // ── Send initialize (id=1) ────────────────────────────────────────
    let init_msg = json!({
        "method": "initialize",
        "id": INITIALIZE_ID,
        "params": {
            "capabilities": {
                "experimentalApi": true
            },
            "clientInfo": {
                "name": "symphony-orchestrator",
                "title": "Symphony Orchestrator",
                "version": "0.1.0"
            }
        }
    });
    send_message(stdin, &init_msg).await?;

    // ── Await response to initialize ──────────────────────────────────
    await_response(reader, INITIALIZE_ID, config.read_timeout_ms).await?;

    // ── Send initialized notification (no id) ─────────────────────────
    let initialized_msg = json!({
        "method": "initialized",
        "params": {}
    });
    send_message(stdin, &initialized_msg).await?;

    // ── Send thread/start (id=2) ──────────────────────────────────────
    let thread_start_msg = json!({
        "method": "thread/start",
        "id": THREAD_START_ID,
        "params": {
            "approvalPolicy": config.approval_policy,
            "sandbox": config.thread_sandbox,
            "cwd": workspace_path,
            "dynamicTools": dynamic_tool::tool_specs()
        }
    });
    send_message(stdin, &thread_start_msg).await?;

    // ── Await response to thread/start, extract thread_id ────────────
    let thread_result =
        await_response(reader, THREAD_START_ID, config.read_timeout_ms).await?;

    let thread_id = thread_result
        .get("thread")
        .and_then(|t| t.get("id"))
        .and_then(|id| id.as_str())
        .ok_or_else(|| {
            SymphonyError::ResponseError(format!(
                "invalid thread payload: {:?}",
                thread_result
            ))
        })?
        .to_string();

    Ok(thread_id)
}

// ── Observability helpers ─────────────────────────────────────────────

/// Log a non-JSON stream line at WARN (if it looks like an error) or DEBUG.
fn log_non_json_line(text: &str, stream_label: &str) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    let truncated = if trimmed.len() > MAX_STREAM_LOG_BYTES {
        &trimmed[..MAX_STREAM_LOG_BYTES]
    } else {
        trimmed
    };

    if looks_like_error(truncated) {
        tracing::warn!("Codex {} output: {}", stream_label, truncated);
    } else {
        tracing::debug!("Codex {} output: {}", stream_label, truncated);
    }
}

/// Return true if `text` looks like an error/warning line.
fn looks_like_error(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("error")
        || lower.contains("warning")
        || lower.contains("failed")
        || lower.contains("fatal")
        || lower.contains("panic")
        || lower.contains("exception")
}

/// Read all lines from the subprocess stderr and log them at DEBUG.
/// Runs as a fire-and-forget tokio task.
async fn drain_stderr(stderr: tokio::process::ChildStderr) {
    use tokio::io::AsyncBufReadExt as _;
    let mut reader = BufReader::new(stderr);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) | Err(_) => break,
            Ok(_) => {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    tracing::debug!(target: "codex_stderr", "{}", trimmed);
                }
            }
        }
    }
}
