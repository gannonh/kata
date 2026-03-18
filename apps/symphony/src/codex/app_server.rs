//! Codex app-server client — subprocess lifecycle and turn streaming.
//!
//! Ports the Elixir `SymphonyElixir.Codex.AppServer` module to idiomatic Rust.
//!
//! This module will be fully implemented in S05/T02 and S05/T03.
//! The stubs here define the public API surface so dependent modules compile.

use std::path::Path;

use crate::domain::{AgentEvent, CodexConfig, Issue};
use crate::error::{Result, SymphonyError};

// ── Public types ──────────────────────────────────────────────────────

/// Opaque handle to a running Codex app-server subprocess session.
///
/// Holds the subprocess I/O channels and session state needed to run turns.
/// Created by `start_session`; consumed by `stop_session`.
pub struct SessionHandle {
    /// Session identifier returned by the Codex initialize handshake.
    pub session_id: String,
    // Additional fields (subprocess stdin/stdout, channels) added in T02.
}

/// The outcome of a completed Codex agent turn.
///
/// Contains the turn's event stream output, final text, and token accounting.
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
/// Sends `initialize` → awaits `initialized` → sends `thread/start` + `turn/start`.
/// Returns a `SessionHandle` on success.
///
/// # Errors
/// - `CodexNotFound` — the configured command does not exist on PATH
/// - `InvalidWorkspaceCwd` — workspace path is invalid or not a directory
/// - `ResponseTimeout` — handshake did not complete within the configured timeout
/// - `ResponseError` — subprocess sent an unexpected response during handshake
pub async fn start_session(
    _config: &CodexConfig,
    _issue: &Issue,
    _workspace_path: &Path,
) -> Result<SessionHandle> {
    Err(SymphonyError::Other(
        "app_server::start_session not yet implemented (S05/T02)".to_string(),
    ))
}

/// Run a single agent turn and stream events via the provided callback.
///
/// Sends the turn prompt and reads line-delimited JSON events until the turn
/// completes, fails, or times out.
///
/// # Errors
/// - `TurnFailed` — turn ended with an error response
/// - `TurnCancelled` — turn was cancelled by the orchestrator
/// - `TurnInputRequired` — turn requires interactive user input
/// - `TurnTimeout` — turn did not complete within the configured timeout
/// - `PortExit` — subprocess exited unexpectedly
pub async fn run_turn<F>(
    _handle: &mut SessionHandle,
    _prompt: &str,
    _event_callback: F,
) -> Result<TurnResult>
where
    F: FnMut(AgentEvent) + Send,
{
    Err(SymphonyError::Other(
        "app_server::run_turn not yet implemented (S05/T02)".to_string(),
    ))
}

/// Gracefully stop a Codex app-server session.
///
/// Sends a shutdown signal to the subprocess and waits for it to exit.
/// Consumes the `SessionHandle`.
///
/// # Errors
/// - `PortExit` — subprocess exited with a non-zero status
pub async fn stop_session(_handle: SessionHandle) -> Result<()> {
    Err(SymphonyError::Other(
        "app_server::stop_session not yet implemented (S05/T02)".to_string(),
    ))
}
