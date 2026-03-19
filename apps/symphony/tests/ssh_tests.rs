/// Red test suite for S08: SSH Remote Worker Extension.
///
/// All tests call into `src/ssh.rs` stubs (which `todo!()`). The suite
/// is expected to compile cleanly and fail at runtime.
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::TempDir;

use symphony::ssh::{parse_target, shell_escape, ssh_args, validate_remote_workspace_cwd, SshRunner, WorkerHostSelection};

// ── Helper ──────────────────────────────────────────────────────────────────

/// Install a fake `ssh` script that writes its arguments to `trace_file` and
/// returns a `TempDir` whose `bin/` sub-directory is prepended to `PATH`.
///
/// The caller must keep the returned `TempDir` alive for the duration of the
/// test (dropping it removes the temporary directory).
fn fake_ssh_on_path(trace_file: &Path) -> TempDir {
    let dir = tempfile::tempdir().expect("create tempdir");
    let bin_dir = dir.path().join("bin");
    fs::create_dir_all(&bin_dir).expect("create bin dir");

    let ssh_path = bin_dir.join("ssh");
    let trace = trace_file.display().to_string();
    let script = format!(
        "#!/bin/sh\nprintf 'ARGV:%s\\n' \"$*\" >> \"{trace}\"\nexit 0\n",
        trace = trace
    );

    let mut f = fs::File::create(&ssh_path).expect("create fake ssh");
    f.write_all(script.as_bytes()).expect("write fake ssh");
    drop(f);

    // Make executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&ssh_path, fs::Permissions::from_mode(0o755))
            .expect("chmod fake ssh");
    }

    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{}:{}", bin_dir.display(), current_path);
    std::env::set_var("PATH", &new_path);

    dir
}

// ── parse_target tests ───────────────────────────────────────────────────────

#[test]
fn test_parse_target_plain_host() {
    let (host, port) = parse_target("myhost");
    assert_eq!(host, "myhost");
    assert_eq!(port, 22);
}

#[test]
fn test_parse_target_host_port() {
    let (host, port) = parse_target("myhost:2222");
    assert_eq!(host, "myhost");
    assert_eq!(port, 2222);
}

#[test]
fn test_parse_target_user_at_host_port() {
    let (host, port) = parse_target("user@myhost:2200");
    assert_eq!(host, "user@myhost");
    assert_eq!(port, 2200);
}

#[test]
fn test_parse_target_ipv6_bracketed() {
    let (host, port) = parse_target("[::1]:2222");
    assert_eq!(host, "[::1]");
    assert_eq!(port, 2222);
}

#[test]
fn test_parse_target_ipv6_unbracketed() {
    // Unbracketed IPv6 must NOT be split — treated as bare hostname, port=22.
    let (host, port) = parse_target("::1");
    assert_eq!(host, "::1");
    assert_eq!(port, 22);
}

// ── shell_escape tests ───────────────────────────────────────────────────────

#[test]
fn test_shell_escape_plain() {
    assert_eq!(shell_escape("hello"), "'hello'");
}

#[test]
fn test_shell_escape_with_single_quote() {
    // "it's" → 'it'"'"'s'
    assert_eq!(shell_escape("it's"), "'it'\"'\"'s'");
}

// ── ssh_args tests ───────────────────────────────────────────────────────────

#[test]
fn test_ssh_args_no_config() {
    // Ensure SYMPHONY_SSH_CONFIG is not set for this test.
    std::env::remove_var("SYMPHONY_SSH_CONFIG");

    let args = ssh_args("myhost:2222", "echo hello");
    let joined = args.join(" ");

    assert!(joined.contains("-p"), "expected -p flag, got: {joined}");
    assert!(joined.contains("2222"), "expected port 2222, got: {joined}");
    assert!(joined.contains("myhost"), "expected host, got: {joined}");
    assert!(!joined.contains("-F"), "should have no -F flag, got: {joined}");
}

#[test]
fn test_ssh_args_with_config() {
    std::env::set_var("SYMPHONY_SSH_CONFIG", "/tmp/ssh.conf");

    let args = ssh_args("myhost", "echo hello");
    let joined = args.join(" ");

    assert!(joined.contains("-F /tmp/ssh.conf"), "expected -F flag, got: {joined}");

    // Clean up
    std::env::remove_var("SYMPHONY_SSH_CONFIG");
}

// ── fake ssh launch test ─────────────────────────────────────────────────────

#[tokio::test]
async fn test_fake_ssh_launch() {
    let trace_dir = tempfile::tempdir().expect("tempdir");
    let trace_file = trace_dir.path().join("ssh.trace");

    let _fake_dir = fake_ssh_on_path(&trace_file);
    std::env::remove_var("SYMPHONY_SSH_CONFIG");

    let _child = SshRunner::start_process("myhost:2222", "echo ready").await
        .expect("start_process");

    // Give the fake script time to write its trace.
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;

    let trace = fs::read_to_string(&trace_file).expect("read trace");
    assert!(trace.contains("-T"), "expected -T in args, got: {trace}");
    assert!(trace.contains("-p"), "expected -p in args, got: {trace}");
    assert!(trace.contains("2222"), "expected port 2222, got: {trace}");
    assert!(trace.contains("myhost"), "expected host in args, got: {trace}");
    assert!(trace.contains("echo ready"), "expected command in args, got: {trace}");
}

// ── WorkerHostSelection / select_worker_host tests ──────────────────────────
//
// These tests exercise the host-selection logic that will live in
// `orchestrator.rs::select_worker_host`. For T01 (red phase) we call the
// helper directly from ssh.rs stubs to prove the tests compile and fail.
//
// The helpers below mirror what the orchestrator will expose: a simple
// function that takes the list of configured hosts, per-host load counts,
// the cap, and an optional preferred host, and returns a `WorkerHostSelection`.

/// Stub: will be replaced by orchestrator wiring in T02/T03.
fn select_worker_host(
    ssh_hosts: &[String],
    load: &std::collections::HashMap<String, usize>,
    cap: usize,
    preferred: Option<&str>,
) -> WorkerHostSelection {
    todo!("implement in T02/T03")
}

#[test]
fn test_select_worker_host_local_mode() {
    let hosts: Vec<String> = vec![];
    let load = std::collections::HashMap::new();
    let result = select_worker_host(&hosts, &load, 4, None);
    assert_eq!(result, WorkerHostSelection::Local);
}

#[test]
fn test_select_worker_host_prefers_prior_host() {
    let hosts = vec!["host-a".to_string(), "host-b".to_string()];
    let mut load = std::collections::HashMap::new();
    load.insert("host-a".to_string(), 1);
    load.insert("host-b".to_string(), 0);

    // preferred = host-a, still under cap of 4
    let result = select_worker_host(&hosts, &load, 4, Some("host-a"));
    assert_eq!(result, WorkerHostSelection::Remote("host-a".to_string()));
}

#[test]
fn test_select_worker_host_skips_full_host() {
    let hosts = vec!["host-a".to_string(), "host-b".to_string()];
    let mut load = std::collections::HashMap::new();
    load.insert("host-a".to_string(), 4); // at cap
    load.insert("host-b".to_string(), 0);

    // preferred = host-a but it's at cap, so host-b should be selected
    let result = select_worker_host(&hosts, &load, 4, Some("host-a"));
    assert_eq!(result, WorkerHostSelection::Remote("host-b".to_string()));
}

#[test]
fn test_select_worker_host_blocks_when_all_full() {
    let hosts = vec!["host-a".to_string(), "host-b".to_string()];
    let mut load = std::collections::HashMap::new();
    load.insert("host-a".to_string(), 4);
    load.insert("host-b".to_string(), 4);

    let result = select_worker_host(&hosts, &load, 4, None);
    assert_eq!(result, WorkerHostSelection::NoneAvailable);
}

// ── remote workspace validation ──────────────────────────────────────────────

#[test]
fn test_remote_workspace_validation() {
    // Absolute path must pass.
    assert!(validate_remote_workspace_cwd("/home/user/project").is_ok());

    // Relative path must return Err.
    assert!(validate_remote_workspace_cwd("relative/path").is_err());

    // Empty string must return Err.
    assert!(validate_remote_workspace_cwd("").is_err());
}
