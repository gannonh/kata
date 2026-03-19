---
id: T01
parent: S08
milestone: M001
provides:
  - src/ssh.rs stub module with all public signatures
  - SymphonyError::SshLaunchFailed(String) variant
  - WorkerHostSelection enum (Local, Remote, NoneAvailable)
  - tests/ssh_tests.rs with 15 red test cases
key_files:
  - src/ssh.rs
  - src/error.rs
  - src/lib.rs
  - tests/ssh_tests.rs
key_decisions:
  - All ssh.rs functions are todo!() stubs in T01; real implementations come in T02
  - select_worker_host logic is stubbed as a test-local function to prove tests compile; T02/T03 will move it to orchestrator.rs
  - validate_remote_workspace_cwd is stubbed; real implementation is just a non-empty absolute path check (no FS access)
patterns_established:
  - fake_ssh_on_path(trace_file) helper pattern for SSH subprocess tests (same as Elixir ssh_test.exs)
observability_surfaces:
  - SymphonyError::SshLaunchFailed(String) — new error variant in the error chain
duration: ~20min
verification_result: passed
completed_at: 2026-03-19
blocker_discovered: false
---

# T01: Create `tests/ssh_tests.rs` red suite and `src/ssh.rs` stub

**Established the verification target: 15 red test cases in `tests/ssh_tests.rs`, all failing at runtime on `todo!()`, with `cargo build` clean.**

## What Happened

1. Added `SymphonyError::SshLaunchFailed(String)` variant to `src/error.rs` under a new `── SSH ──` section.
2. Created `src/ssh.rs` with stubs:
   - `WorkerHostSelection` enum (`Local`, `Remote(String)`, `NoneAvailable`)
   - `parse_target(target: &str) -> (String, u16)` → `todo!()`
   - `shell_escape(s: &str) -> String` → `todo!()`
   - `ssh_args(host: &str, command: &str) -> Vec<String>` → `todo!()`
   - `validate_remote_workspace_cwd(workspace: &str) -> Result<String>` → `todo!()`
   - `SshRunner::start_process(host, command) -> Result<Child>` → `todo!()`
3. Registered `pub mod ssh;` in `src/lib.rs`.
4. Created `tests/ssh_tests.rs` with all 15 test cases plus a `fake_ssh_on_path(trace_file)` helper (shell script on PATH that traces args to file, matching the Elixir test pattern).

## Verification

```
cargo build
# Finished dev profile [unoptimized + debuginfo] — zero errors

cargo test --test ssh_tests 2>&1 | grep -c "FAILED"
# 15
```

All 15 tests fail at runtime (not compile errors). Zero compile errors.

## Diagnostics

- `cargo test --test ssh_tests` shows exactly which SSH behavior is unimplemented per test.
- `SymphonyError::SshLaunchFailed(String)` is visible in the error chain for future SSH dispatch failures.

## Deviations

None. Followed the task plan exactly. All functions are `todo!()` as required for the red phase.

## Known Issues

None.
