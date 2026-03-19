---
estimated_steps: 5
estimated_files: 4
---

# T01: Create `tests/ssh_tests.rs` red suite and `src/ssh.rs` stub

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Establish the verification target and module skeleton. Write all 15 test cases with assertions in `tests/ssh_tests.rs` (they will fail because stubs use `todo!()`). Create `src/ssh.rs` with stub signatures. Add `SymphonyError::SshLaunchFailed` and `WorkerHostSelection` enum. This is the red phase of the red→green cycle.

## Steps

1. Add `SymphonyError::SshLaunchFailed(String)` variant to `src/error.rs` (matches Elixir `:ssh_launch_failed` error).
2. Create `src/ssh.rs` with:
   - `pub enum WorkerHostSelection { Local, Remote(String), NoneAvailable }` 
   - `pub fn parse_target(target: &str) -> (String, u16)` → `todo!()`
   - `pub fn shell_escape(s: &str) -> String` → `todo!()`
   - `pub fn ssh_args(host: &str, command: &str) -> Vec<String>` → `todo!()`
   - `pub struct SshRunner;`
   - `impl SshRunner { pub async fn start_process(host: &str, command: &str) -> crate::error::Result<tokio::process::Child> { todo!() } }`
3. Add `pub mod ssh;` to `src/lib.rs`.
4. Create `tests/ssh_tests.rs` with all 15 test functions. Include a `fake_ssh_on_path(trace_file: &Path) -> tempfile::TempDir` helper that writes a shell script echoing its args to `trace_file` and returns a tempdir whose path is prepended to `PATH`. Write assertions for:
   - `test_parse_target_plain_host` — `"myhost"` → host=`"myhost"`, port=22
   - `test_parse_target_host_port` — `"myhost:2222"` → host=`"myhost"`, port=2222
   - `test_parse_target_user_at_host_port` — `"user@myhost:2200"` → host=`"user@myhost"`, port=2200
   - `test_parse_target_ipv6_bracketed` — `"[::1]:2222"` → host=`"[::1]"`, port=2222
   - `test_parse_target_ipv6_unbracketed` — `"::1"` → host=`"::1"`, port=22 (no split)
   - `test_shell_escape_plain` — `"hello"` → `"'hello'"`
   - `test_shell_escape_with_single_quote` — `"it's"` → `"'it'\"'\"'s'"`
   - `test_ssh_args_no_config` — with `SYMPHONY_SSH_CONFIG` unset, args contain `-p` and host but no `-F`
   - `test_ssh_args_with_config` — with `SYMPHONY_SSH_CONFIG=/tmp/ssh.conf`, args contain `-F /tmp/ssh.conf`
   - `test_fake_ssh_launch` — fake ssh script writes args to trace file; assert expected args present
   - `test_select_worker_host_local_mode` — empty `ssh_hosts` → `Local`
   - `test_select_worker_host_prefers_prior_host` — preferred host under cap → `Remote(preferred)`
   - `test_select_worker_host_skips_full_host` — preferred at cap, alternative available → `Remote(alt)`
   - `test_select_worker_host_blocks_when_all_full` — all hosts at cap → `NoneAvailable`
   - `test_remote_workspace_validation` — absolute path passes, relative path returns `Err`
5. Run `cargo test --test ssh_tests` and confirm all tests fail at runtime (not compile errors).

## Must-Haves

- [ ] `SymphonyError::SshLaunchFailed(String)` added to `error.rs`
- [ ] `WorkerHostSelection` enum with `Local`, `Remote(String)`, `NoneAvailable` variants in `ssh.rs`
- [ ] All 15 test functions compile and fail at runtime (no compile errors)
- [ ] `cargo build` succeeds after stub additions

## Verification

- `cargo build` → zero errors
- `cargo test --test ssh_tests 2>&1 | grep -c "FAILED"` → 15 (or close; some may panic on todo!())

## Observability Impact

- Signals added/changed: `SymphonyError::SshLaunchFailed(String)` — new error variant visible in error chain
- How a future agent inspects this: `cargo test --test ssh_tests` shows exact assertion failures per test
- Failure state exposed: Each test failure names the specific SSH behavior that is unimplemented

## Inputs

- `src/error.rs` — add new variant here
- `src/lib.rs` — register new module
- S08-RESEARCH.md — Elixir test patterns (fake-ssh script, IPv6 cases, shell_escape formula)

## Expected Output

- `src/ssh.rs` — stub module with all public signatures
- `src/error.rs` — `SshLaunchFailed(String)` variant added
- `src/lib.rs` — `pub mod ssh;` added
- `tests/ssh_tests.rs` — 15 red test cases with concrete assertions
