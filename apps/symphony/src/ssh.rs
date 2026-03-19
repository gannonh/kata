/// SSH remote worker support for Symphony.
///
/// Port of the Elixir `SymphonyElixir.SSH` module. Handles SSH argument
/// construction, POSIX shell escaping, host:port parsing, and subprocess
/// launch via `tokio::process::Command`.
use std::process::Stdio;
use tokio::process::Child;

use crate::error::{Result, SymphonyError};

/// Host selection result from the orchestrator pool.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkerHostSelection {
    /// No `ssh_hosts` configured — use local subprocess.
    Local,
    /// A remote host was selected.
    Remote(String),
    /// All configured hosts are at capacity.
    NoneAvailable,
}

/// Parse `host`, `host:port`, `user@host:port`, or bracketed IPv6 `[::1]:2222`
/// into `(destination, port)`.
///
/// Returns `(destination, 22)` when no port is present or when the
/// destination part would be invalid (e.g. unbracketed IPv6).
pub fn parse_target(target: &str) -> (String, u16) {
    let trimmed = target.trim();

    // Try to match a trailing `:<digits>` suffix.
    if let Some(colon_pos) = trimmed.rfind(':') {
        let candidate_port = &trimmed[colon_pos + 1..];
        if let Ok(port) = candidate_port.parse::<u16>() {
            let destination = &trimmed[..colon_pos];
            if valid_port_destination(destination) {
                return (destination.to_string(), port);
            }
        }
    }

    (trimmed.to_string(), 22)
}

/// Return true when `destination` can be the host part of a `host:port` pair.
///
/// Rules (matching Elixir `valid_port_destination?`):
/// - Must be non-empty.
/// - If it contains `:` it must be bracketed (e.g. `[::1]`).
fn valid_port_destination(destination: &str) -> bool {
    if destination.is_empty() {
        return false;
    }
    if destination.contains(':') {
        // Only accept if the destination is a bracketed IPv6 literal.
        destination.contains('[') && destination.contains(']')
    } else {
        true
    }
}

/// POSIX single-quote shell escaping.
///
/// Wraps `s` in single quotes, replacing any embedded `'` with `'"'"'`.
pub fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\"'\"'"))
}

/// Build the SSH argument list for invoking `command` on `host`.
///
/// Arg order (matching Elixir `ssh_args/2`):
/// `[-F <config>] -T [-p <port>] <destination> bash -lc <escaped_command>`
pub fn ssh_args(host: &str, command: &str) -> Vec<String> {
    let (destination, port) = parse_target(host);
    let mut args: Vec<String> = Vec::new();

    // Optional SSH config file.
    if let Ok(config_path) = std::env::var("SYMPHONY_SSH_CONFIG") {
        if !config_path.is_empty() {
            args.push("-F".to_string());
            args.push(config_path);
        }
    }

    // Disable pseudo-terminal allocation (Elixir uses -T).
    args.push("-T".to_string());

    // Port (omit if default 22 to stay clean, but always include for explicitness
    // since the test asserts -p is present when the host has an explicit port).
    // Elixir's `maybe_put_port` always includes -p when port is non-nil, and
    // parse_target always returns a port (22 as default), so we always emit -p.
    args.push("-p".to_string());
    args.push(port.to_string());

    // Destination.
    args.push(destination);

    // Remote command via bash login shell — split into separate argv tokens.
    args.push("bash".to_string());
    args.push("-lc".to_string());
    args.push(shell_escape(command));

    args
}

/// Validate that a remote workspace path is absolute (non-empty, starts with `/`).
pub fn validate_remote_workspace_cwd(workspace: &str) -> Result<String> {
    if workspace.is_empty() || !workspace.starts_with('/') {
        return Err(SymphonyError::InvalidWorkspaceCwd(format!(
            "remote workspace must be an absolute path, got: {:?}",
            workspace
        )));
    }
    Ok(workspace.to_string())
}

/// Thin wrapper for launching SSH subprocesses.
pub struct SshRunner;

impl SshRunner {
    /// Spawn an SSH subprocess that runs `command` on `host`.
    ///
    /// stdin/stdout/stderr are all piped so the caller can interact with the
    /// process. Maps `NotFound` to `SshLaunchFailed` with a clear message.
    pub async fn start_process(host: &str, command: &str) -> Result<Child> {
        let args = ssh_args(host, command);

        tokio::process::Command::new("ssh")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    SymphonyError::SshLaunchFailed("ssh binary not found".to_string())
                } else {
                    SymphonyError::SshLaunchFailed(e.to_string())
                }
            })
    }
}
