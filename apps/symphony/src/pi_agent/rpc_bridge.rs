//! Pi RPC bridge — subprocess lifecycle, JSON-line I/O, and turn management.
//!
//! This module launches `kata --mode rpc` (or a compatible pi-agent command)
//! and drives prompt turns over stdin/stdout JSON lines.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use chrono::Utc;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::domain::{AgentEvent, Issue, PiAgentConfig};
use crate::error::{Result, SymphonyError};
use crate::path_safety;
use crate::pi_agent::protocol::{
    ExtensionUIResponse, RpcCommand, RpcOutputLine, RpcResponse, SessionStats,
};
use crate::pi_agent::token_accounting::{TokenDelta, TokenTracker};
use crate::ssh::{self, SshRunner};

const HANDSHAKE_TIMEOUT_MS: u64 = 30_000;
const MAX_STREAM_LOG_BYTES: usize = 1_000;
const SHUTDOWN_GRACE_MS: u64 = 3_000;

static COMMAND_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Opaque handle to a running pi-agent subprocess session.
pub struct SessionHandle {
    /// Stable session ID reported by pi-agent.
    pub session_id: String,

    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,
    pid: Option<String>,

    issue_id: String,
    issue_identifier: String,
    read_timeout_ms: u64,
    stall_timeout_ms: u64,
    token_tracker: TokenTracker,
}

/// Outcome of one completed prompt turn.
#[derive(Debug)]
pub struct TurnResult {
    pub events: Vec<AgentEvent>,
    pub output_text: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub rate_limits: Option<Value>,
}

fn next_command_id(prefix: &str) -> String {
    let n = COMMAND_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{}-{n}", Utc::now().timestamp_millis())
}

fn build_command_parts(config: &PiAgentConfig, workspace_path: &str) -> Result<Vec<String>> {
    if config.command.is_empty() {
        return Err(SymphonyError::PiAgentError(
            "pi_agent.command cannot be empty".to_string(),
        ));
    }

    let mut parts = config.command.clone();
    parts.push("--mode".to_string());
    parts.push("rpc".to_string());
    parts.push("--cwd".to_string());
    parts.push(workspace_path.to_string());

    if config.no_session {
        parts.push("--no-session".to_string());
    }
    if let Some(model) = config.model.as_deref() {
        parts.push("--model".to_string());
        parts.push(model.to_string());
    }
    if let Some(path) = config.append_system_prompt.as_deref() {
        parts.push("--append-system-prompt".to_string());
        parts.push(path.to_string());
    }

    Ok(parts)
}

fn shell_join(parts: &[String]) -> String {
    parts
        .iter()
        .map(|part| ssh::shell_escape(part))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn send_command(stdin: &mut tokio::process::ChildStdin, command: &RpcCommand) -> Result<()> {
    let mut line = serde_json::to_string(command).map_err(|err| {
        SymphonyError::PiAgentError(format!("failed to serialize command: {err}"))
    })?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|err| SymphonyError::PiAgentError(format!("failed to write stdin: {err}")))?;
    stdin
        .flush()
        .await
        .map_err(|err| SymphonyError::PiAgentError(format!("failed to flush stdin: {err}")))?;
    Ok(())
}

async fn read_line(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    timeout_ms: u64,
) -> Result<String> {
    let mut line = String::new();
    let read_fut = reader.read_line(&mut line);
    match tokio::time::timeout(Duration::from_millis(timeout_ms), read_fut).await {
        Ok(Ok(0)) => Err(SymphonyError::PiAgentError(
            "pi-agent stdout closed unexpectedly".to_string(),
        )),
        Ok(Ok(_)) => Ok(line),
        Ok(Err(err)) => Err(SymphonyError::PiAgentError(format!(
            "failed to read pi-agent stdout: {err}"
        ))),
        Err(_) => Err(SymphonyError::PiAgentError(format!(
            "pi-agent read timed out after {timeout_ms}ms"
        ))),
    }
}

fn parse_output_line(line: &str) -> Option<RpcOutputLine> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    match serde_json::from_str::<RpcOutputLine>(trimmed) {
        Ok(parsed) => Some(parsed),
        Err(err) => {
            let preview = if trimmed.len() > MAX_STREAM_LOG_BYTES {
                &trimmed[..MAX_STREAM_LOG_BYTES]
            } else {
                trimmed
            };
            tracing::debug!(
                error = %err,
                line = %preview,
                "ignoring non-protocol stdout line from pi-agent"
            );
            None
        }
    }
}

fn extract_session_id(response: &RpcResponse) -> Option<String> {
    let data = response.data.as_ref()?;

    data.get("sessionId")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .or_else(|| {
            data.get("session_id")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .or_else(|| {
            data.get("session")
                .and_then(|session| session.get("id"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}

async fn maybe_respond_extension_ui(
    stdin: &mut tokio::process::ChildStdin,
    id: String,
    method: String,
) {
    let response = match method.as_str() {
        "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text" => return,
        "confirm" => ExtensionUIResponse::reject(id),
        _ => ExtensionUIResponse::cancel(id),
    };

    if let Ok(mut line) = serde_json::to_string(&response) {
        line.push('\n');
        let _ = stdin.write_all(line.as_bytes()).await;
        let _ = stdin.flush().await;
    }
}

fn maybe_extract_text(message: &Value) -> Option<String> {
    let content = message.get("content")?.as_array()?;
    for item in content {
        if item.get("type").and_then(Value::as_str) == Some("text") {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                return Some(text.to_string());
            }
        }
    }
    None
}

fn decode_session_stats(data: Value) -> Result<SessionStats> {
    if let Ok(stats) = serde_json::from_value::<SessionStats>(data.clone()) {
        return Ok(stats);
    }

    if let Some(stats_val) = data.get("stats") {
        return serde_json::from_value::<SessionStats>(stats_val.clone()).map_err(|err| {
            SymphonyError::PiAgentError(format!("failed to parse stats payload: {err}"))
        });
    }

    Err(SymphonyError::PiAgentError(
        "stats response missing parseable payload".to_string(),
    ))
}

async fn read_stats_response(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    stdin: &mut tokio::process::ChildStdin,
    timeout_ms: u64,
) -> Result<SessionStats> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms.max(5_000));

    loop {
        let remaining_ms = deadline
            .saturating_duration_since(tokio::time::Instant::now())
            .as_millis() as u64;
        if remaining_ms == 0 {
            return Err(SymphonyError::PiAgentError(
                "timed out waiting for get_session_stats response".to_string(),
            ));
        }

        let line = read_line(reader, remaining_ms.min(2_000)).await?;
        let Some(parsed) = parse_output_line(&line) else {
            continue;
        };

        match parsed {
            RpcOutputLine::Response(response)
                if response.command == "get_session_stats"
                    || response.command == "getSessionStats" =>
            {
                if !response.success {
                    return Err(SymphonyError::PiAgentError(
                        response
                            .error
                            .unwrap_or_else(|| "get_session_stats failed".to_string()),
                    ));
                }
                let data = response.data.ok_or_else(|| {
                    SymphonyError::PiAgentError(
                        "get_session_stats response missing `data`".to_string(),
                    )
                })?;
                return decode_session_stats(data);
            }
            RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                maybe_respond_extension_ui(stdin, id, method).await;
            }
            _ => {}
        }
    }
}

async fn wait_for_handshake(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    stdin: &mut tokio::process::ChildStdin,
    timeout_ms: u64,
) -> Result<String> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);

    loop {
        let remaining_ms = deadline
            .saturating_duration_since(tokio::time::Instant::now())
            .as_millis() as u64;
        if remaining_ms == 0 {
            return Err(SymphonyError::PiAgentError(
                "timed out waiting for get_state response".to_string(),
            ));
        }

        let line = read_line(reader, remaining_ms.min(2_000)).await?;
        let Some(parsed) = parse_output_line(&line) else {
            continue;
        };

        match parsed {
            RpcOutputLine::Response(response)
                if response.command == "get_state" || response.command == "getState" =>
            {
                if !response.success {
                    return Err(SymphonyError::PiAgentError(
                        response
                            .error
                            .unwrap_or_else(|| "get_state failed".to_string()),
                    ));
                }
                return Ok(
                    extract_session_id(&response).unwrap_or_else(|| next_command_id("pi-session"))
                );
            }
            RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                maybe_respond_extension_ui(stdin, id, method).await;
            }
            _ => {}
        }
    }
}

/// Start a pi-agent session process for an issue.
pub async fn start_session(
    config: &PiAgentConfig,
    issue: &Issue,
    workspace_path: &Path,
    workspace_root: &Path,
    worker_host: Option<&str>,
    container_id: Option<&str>,
) -> Result<SessionHandle> {
    let command_parts = match (container_id, worker_host) {
        (Some(_), _) => build_command_parts(config, "/workspace")?,
        _ => {
            let workspace_for_args = workspace_path.to_string_lossy().to_string();
            build_command_parts(config, &workspace_for_args)?
        }
    };

    let (workspace_str, mut child) = match (container_id, worker_host) {
        (Some(container_id), _) => {
            let workspace_str = workspace_path.to_string_lossy().to_string();
            let remote_cmd = format!(
                "cd {} && {}",
                ssh::shell_escape(&workspace_str),
                shell_join(&command_parts)
            );

            let child = crate::docker::exec_command(container_id, &remote_cmd)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|err| {
                    SymphonyError::PiAgentError(format!("docker spawn failed: {err}"))
                })?;

            (workspace_str, child)
        }
        (None, Some(host)) => {
            let workspace_str =
                crate::ssh::validate_remote_workspace_cwd(&workspace_path.to_string_lossy())?;
            let remote_cmd = format!(
                "cd {} && {}",
                ssh::shell_escape(&workspace_str),
                shell_join(&command_parts)
            );
            let child = SshRunner::start_process(host, &remote_cmd).await?;
            (workspace_str, child)
        }
        (None, None) => {
            let canonical_workspace = validate_workspace_cwd(workspace_path, workspace_root)?;
            let workspace_str = canonical_workspace.to_string_lossy().to_string();
            let program = command_parts
                .first()
                .cloned()
                .ok_or_else(|| SymphonyError::PiAgentError("empty pi-agent command".to_string()))?;

            let child = tokio::process::Command::new(program)
                .args(command_parts.iter().skip(1))
                .current_dir(&canonical_workspace)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|err| SymphonyError::PiAgentError(format!("spawn failed: {err}")))?;

            (workspace_str, child)
        }
    };

    let pid = child.id().map(|p| p.to_string());
    let mut stdin = child.stdin.take().ok_or_else(|| {
        SymphonyError::PiAgentError("failed to capture pi-agent stdin".to_string())
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        SymphonyError::PiAgentError("failed to capture pi-agent stdout".to_string())
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        SymphonyError::PiAgentError("failed to capture pi-agent stderr".to_string())
    })?;

    tokio::spawn(drain_stderr(stderr));
    let mut stdout_reader = BufReader::new(stdout);

    let get_state_id = next_command_id("get-state");
    send_command(
        &mut stdin,
        &RpcCommand::GetState {
            id: Some(get_state_id),
        },
    )
    .await?;

    let session_id =
        match wait_for_handshake(&mut stdout_reader, &mut stdin, HANDSHAKE_TIMEOUT_MS).await {
            Ok(session_id) => session_id,
            Err(err) => {
                let _ = child.kill().await;
                return Err(err);
            }
        };

    tracing::info!(
        issue_id = %issue.id,
        issue_identifier = %issue.identifier,
        workspace = %workspace_str,
        session_id = %session_id,
        "pi-agent session started"
    );

    Ok(SessionHandle {
        session_id,
        child,
        stdin,
        stdout_reader,
        pid,
        issue_id: issue.id.clone(),
        issue_identifier: issue.identifier.clone(),
        read_timeout_ms: config.read_timeout_ms,
        stall_timeout_ms: config.stall_timeout_ms,
        token_tracker: TokenTracker::new(),
    })
}

/// Run one prompt turn and stream mapped events until `agent_end`.
pub async fn run_turn(
    handle: &mut SessionHandle,
    prompt: &str,
    mut event_callback: impl FnMut(AgentEvent) + Send,
) -> Result<TurnResult> {
    let turn_id = next_command_id("prompt");
    send_command(
        &mut handle.stdin,
        &RpcCommand::Prompt {
            id: Some(turn_id.clone()),
            message: prompt.to_string(),
        },
    )
    .await?;

    let session_started = AgentEvent::SessionStarted {
        timestamp: Utc::now(),
        codex_app_server_pid: handle.pid.clone(),
        session_id: handle.session_id.clone(),
    };
    event_callback(session_started.clone());
    let mut events = vec![session_started];

    let mut output_text: Option<String> = None;
    let turn_line_timeout_ms = handle.stall_timeout_ms.max(handle.read_timeout_ms);

    loop {
        let line = read_line(&mut handle.stdout_reader, turn_line_timeout_ms).await?;
        let Some(parsed) = parse_output_line(&line) else {
            continue;
        };

        match parsed {
            RpcOutputLine::AgentEnd { .. } => break,
            RpcOutputLine::Response(response) if response.command == "prompt" => {
                if !response.success {
                    let err = response
                        .error
                        .unwrap_or_else(|| "prompt command failed".to_string());
                    let failed = AgentEvent::TurnFailed {
                        timestamp: Utc::now(),
                        codex_app_server_pid: handle.pid.clone(),
                        turn_id: turn_id.clone(),
                        error: err.clone(),
                    };
                    event_callback(failed.clone());
                    events.push(failed);
                    return Err(SymphonyError::TurnFailed(err));
                }
            }
            RpcOutputLine::ToolExecutionStart {
                tool_name, args, ..
            } => {
                let name = tool_name.unwrap_or_else(|| "unknown".to_string());
                let payload = serde_json::to_string(&args).unwrap_or_else(|_| "{}".to_string());
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!("tool_start: {name} {payload}"),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::ToolExecutionEnd {
                tool_name,
                is_error,
                ..
            } => {
                let name = tool_name.unwrap_or_else(|| "unknown".to_string());
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: if is_error {
                        format!("tool_error: {name}")
                    } else {
                        format!("tool_end: {name}")
                    },
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::AutoCompactionStart { reason } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!(
                        "auto_compaction_start: {}",
                        reason.unwrap_or_else(|| "unknown".to_string())
                    ),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::AutoCompactionEnd { aborted } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!("auto_compaction_end: aborted={aborted}"),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::AutoRetryStart {
                attempt,
                error_message,
                ..
            } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!(
                        "auto_retry_start: attempt={attempt} error={}",
                        error_message.unwrap_or_default()
                    ),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::AutoRetryEnd { success } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!("auto_retry_end: success={success}"),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::ExtensionError {
                error: Some(error_text),
                ..
            } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!("extension_error: {error_text}"),
                };
                event_callback(event.clone());
                events.push(event);
            }
            RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                maybe_respond_extension_ui(&mut handle.stdin, id, method).await;
            }
            RpcOutputLine::MessageUpdate { message } | RpcOutputLine::MessageEnd { message } => {
                if let Some(text) = maybe_extract_text(&message) {
                    output_text = Some(text);
                }
            }
            _ => {}
        }
    }

    let stats_id = next_command_id("stats");
    send_command(
        &mut handle.stdin,
        &RpcCommand::GetSessionStats { id: Some(stats_id) },
    )
    .await?;

    let token_delta = match read_stats_response(
        &mut handle.stdout_reader,
        &mut handle.stdin,
        handle.read_timeout_ms,
    )
    .await
    {
        Ok(stats) => {
            handle
                .token_tracker
                .update(stats.tokens.input, stats.tokens.output, stats.tokens.total)
        }
        Err(err) => {
            tracing::warn!(
                issue_id = %handle.issue_id,
                issue_identifier = %handle.issue_identifier,
                error = %err,
                "failed to read get_session_stats; reporting zero token delta"
            );
            TokenDelta::default()
        }
    };

    let completed = AgentEvent::TurnCompleted {
        timestamp: Utc::now(),
        codex_app_server_pid: handle.pid.clone(),
        turn_id: turn_id.clone(),
        message: output_text.clone(),
        input_tokens: token_delta.input_tokens,
        output_tokens: token_delta.output_tokens,
        total_tokens: token_delta.total_tokens,
        rate_limits: None,
    };
    event_callback(completed.clone());
    events.push(completed);

    Ok(TurnResult {
        events,
        output_text,
        input_tokens: token_delta.input_tokens,
        output_tokens: token_delta.output_tokens,
        total_tokens: token_delta.total_tokens,
        rate_limits: None,
    })
}

/// Stop a pi-agent session process.
pub async fn stop_session(mut handle: SessionHandle) -> Result<()> {
    let _ = send_command(&mut handle.stdin, &RpcCommand::Abort { id: None }).await;
    drop(handle.stdin);

    match tokio::time::timeout(
        Duration::from_millis(SHUTDOWN_GRACE_MS),
        handle.child.wait(),
    )
    .await
    {
        Ok(Ok(_status)) => Ok(()),
        _ => {
            let _ = handle.child.kill().await;
            Ok(())
        }
    }
}

async fn drain_stderr(stderr: tokio::process::ChildStderr) {
    let mut reader = BufReader::new(stderr);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line).await {
            Ok(0) => break,
            Ok(_) => {
                let text = line.trim_end_matches(['\n', '\r']);
                if !text.is_empty() {
                    tracing::debug!(stream = "pi-agent-stderr", line = %text);
                }
            }
            Err(_) => break,
        }
    }
}

/// Validate that `workspace_path` is a legitimate subdirectory of `workspace_root`.
fn validate_workspace_cwd(workspace_path: &Path, workspace_root: &Path) -> Result<PathBuf> {
    let canonical_workspace = path_safety::canonicalize(workspace_path)?;
    let canonical_root = path_safety::canonicalize(workspace_root)?;

    let expanded_workspace = expand_path_no_symlinks(workspace_path);
    let expanded_root = expand_path_no_symlinks(workspace_root);

    if canonical_workspace == canonical_root {
        return Err(SymphonyError::InvalidWorkspaceCwd(format!(
            "workspace is the workspace root: {}",
            canonical_workspace.display()
        )));
    }

    if canonical_workspace.starts_with(&canonical_root) {
        return Ok(canonical_workspace);
    }

    if expanded_workspace.starts_with(&expanded_root) && expanded_workspace != expanded_root {
        return Err(SymphonyError::InvalidWorkspaceCwd(format!(
            "symlink escape: {} resolves outside workspace root {}",
            workspace_path.display(),
            canonical_root.display()
        )));
    }

    Err(SymphonyError::InvalidWorkspaceCwd(format!(
        "workspace {} is outside root {}",
        canonical_workspace.display(),
        canonical_root.display()
    )))
}

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
