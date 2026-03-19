/// SSH remote worker support for Symphony.
///
/// Stubs — all implementations are `todo!()` in T01 (red phase).
/// The green phase (T02) fills in the real logic.
use tokio::process::Child;

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
pub fn parse_target(_target: &str) -> (String, u16) {
    todo!()
}

/// POSIX single-quote shell escaping.
///
/// Wraps `s` in single quotes, replacing any embedded `'` with `'"'"'`.
pub fn shell_escape(_s: &str) -> String {
    todo!()
}

/// Build the SSH argument list for invoking `command` on `host`.
pub fn ssh_args(_host: &str, _command: &str) -> Vec<String> {
    todo!()
}

/// Validate that a remote workspace path is absolute (non-empty, starts with `/`).
pub fn validate_remote_workspace_cwd(_workspace: &str) -> crate::error::Result<String> {
    todo!()
}

/// Thin wrapper for launching SSH subprocesses.
pub struct SshRunner;

impl SshRunner {
    /// Spawn an SSH subprocess that runs `command` on `host`.
    pub async fn start_process(_host: &str, _command: &str) -> crate::error::Result<Child> {
        todo!()
    }
}
