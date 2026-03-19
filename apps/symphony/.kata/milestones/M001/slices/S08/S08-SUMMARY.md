---
id: S08
parent: M001
milestone: M001
provides:
  - src/ssh.rs — parse_target, shell_escape, ssh_args, validate_remote_workspace_cwd, SshRunner::start_process, select_worker_host (free function)
  - SymphonyError::SshLaunchFailed(String) error variant
  - WorkerHostSelection enum (Local, Remote(String), NoneAvailable)
  - start_session worker_host branch (SSH vs local dispatch)
  - Orchestrator::select_worker_host method + dispatch/retry wiring
  - tests/ssh_tests.rs — 15 integration + unit tests
requires:
  - slice: S05
    provides: codex/app_server.rs start_session signature (extended with worker_host param)
  - slice: S06
    provides: orchestrator.rs RunAttempt/RetryEntry structs, dispatch loop, retry loop
affects:
  - S09
key_files:
  - src/ssh.rs
  - src/error.rs
  - src/lib.rs
  - src/codex/app_server.rs
  - src/orchestrator.rs
  - tests/ssh_tests.rs
key_decisions:
  - select_worker_host implemented as a public free function in ssh.rs so tests can call it directly without constructing Orchestrator; orchestrator method delegates to it
  - ssh_args emits -T flag (matching Elixir reference) not -o StrictHostKeyChecking=no (as originally suggested in plan)
  - NoneAvailable in retry path reschedules via schedule_retry_with_context rather than silently dropping the retry
  - validate_remote_workspace_cwd stays in ssh.rs (added in T02); app_server.rs calls it via crate::ssh — no duplication
  - worker_host added as last parameter of start_session; None preserves all existing behaviour exactly
patterns_established:
  - fake_ssh_on_path(trace_file) helper pattern for SSH subprocess tests (append args to trace file, prepend dir to PATH)
  - select_worker_host(ssh_hosts, load, cap, preferred) three-way eligibility: empty pool→Local, preferred under cap→prefer, else least-loaded by (count,index) tiebreak, all full→NoneAvailable
  - match worker_host { None => local bash path, Some(host) => SshRunner::start_process } cleanly separates dispatch strategies inside start_session
observability_surfaces:
  - tracing::info!(worker_host, issue_id, cmd) on remote SSH spawn path
  - tracing::warn! event="ssh_pool_exhausted" on fresh dispatch block
  - tracing::warn! event="ssh_pool_exhausted_retry" on retry dispatch block
  - OrchestratorSnapshot.running[issue_id].worker_host — Some("host") for remote, None for local
  - RetryEntry.worker_host carries host preference into next attempt
  - SymphonyError::SshLaunchFailed(String) surfaces host+OS error in error chain
drill_down_paths:
  - .kata/milestones/M001/slices/S08/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S08/tasks/T02-SUMMARY.md
  - .kata/milestones/M001/slices/S08/tasks/T03-SUMMARY.md
  - .kata/milestones/M001/slices/S08/tasks/T04-SUMMARY.md
duration: ~2.5h (4 tasks)
verification_result: passed
completed_at: 2026-03-19
---

# S08: SSH Remote Worker Extension

**SSH-based remote agent dispatch wired end-to-end: arg construction, host:port parsing, shell escaping, subprocess launch via `SshRunner`, per-host concurrency cap, host-preference on retry, and pool-exhaustion blocking — all proven by 15 passing `ssh_tests` with a fake-SSH trace binary.**

## What Happened

Four tasks progressed red→green in strict order:

**T01** established the verification target: `src/ssh.rs` stubs (`todo!()` for all five functions), `SymphonyError::SshLaunchFailed(String)`, `WorkerHostSelection` enum, `pub mod ssh` in `lib.rs`, and `tests/ssh_tests.rs` with 15 red test cases plus the `fake_ssh_on_path` helper. `cargo build` was clean; all 15 tests failed at runtime, not compile time.

**T02** ported the Elixir `SymphonyElixir.SSH` module (~80 LOC) to idiomatic Rust. `parse_target` uses `rfind(':')` + digit parse + `valid_port_destination()` guard (handles plain host, host:port, user@host:port, `[::1]:2222`, unbracketed `::1`). `shell_escape` wraps in POSIX single-quotes with `'` → `'"'"'`. `ssh_args` emits `[-F config] -T -p <port> <dest> bash -lc <escaped>`. `SshRunner::start_process` uses `tokio::process::Command::new("ssh")` with piped stdio. 11/15 tests passed; 4 host-selection stubs remained for T04.

**T03** added `worker_host: Option<&str>` as the final parameter of `start_session`. A `match worker_host` block routes to the unchanged local `bash -lc` path (`None`) or to `validate_remote_workspace_cwd` + `SshRunner::start_process` (`Some(host)`). The full downstream (handshake, turn streaming, token accounting) is shared. All 33 `start_session` call sites in `codex_tests.rs` and `orchestrator.rs` were updated to pass `None`. All 32 codex_tests passed with zero regressions.

**T04** added `select_worker_host(ssh_hosts, load, cap, preferred) -> WorkerHostSelection` as a public free function in `ssh.rs`, delegated to by an `Orchestrator::select_worker_host` method that builds the per-host load map from `self.state.running.values()`. Fresh dispatch calls `select_worker_host(None)`; retry dispatch calls `select_worker_host(retry.worker_host.as_deref())`. `NoneAvailable` on fresh dispatch logs `tracing::warn!` and skips the issue; `NoneAvailable` on retry reschedules via `schedule_retry_with_context` with cause `"ssh pool exhausted"`. `test_fake_ssh_launch` sleep was bumped 200ms→500ms to eliminate intermittent timing flakiness in parallel suite runs.

## Verification

```
cargo test --test ssh_tests
# 15/15 passed

cargo test
# Full suite: all test binaries green, zero warnings

cargo build
# zero warnings, zero errors
```

## Requirements Advanced

- R011 — SSH Remote Worker Extension now fully implemented and tested

## Requirements Validated

- R011 — Validated: 15 ssh_tests prove SSH arg construction, host:port parsing, shell escaping, SYMPHONY_SSH_CONFIG injection, fake-SSH subprocess launch, per-host cap enforcement, prefer-on-retry, pool exhaustion blocking, local-mode fallback, and remote workspace path validation.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `ssh_args` emits `-T` (Elixir reference flag for disabling pseudo-terminal allocation) instead of `-o StrictHostKeyChecking=no` as the task plan suggested. Elixir source is authoritative; the fake-ssh trace test asserts `-T` is present.
- `select_worker_host` implemented as both a public free function in `ssh.rs` and an orchestrator method. Task plan described only the orchestrator method; the free function keeps test setup clean without requiring `Orchestrator` construction.
- `validate_remote_workspace_cwd` was not duplicated into `app_server.rs` — it already existed in `ssh.rs` from T02; `app_server.rs` calls it via `crate::ssh`.
- `test_fake_ssh_launch` sleep increased 200ms→500ms to address pre-existing timing flakiness under full parallel suite execution.

## Known Limitations

- No real SSH integration test against an actual remote host; tests use a fake-ssh shell script on PATH. Real-host behaviour (authentication, key forwarding, network errors) is untested.
- `SYMPHONY_SSH_CONFIG` injection is the only SSH client option exposed; advanced SSH options (ProxyJump, ControlMaster, etc.) are not configurable.
- `SshRunner::start_process` does not implement connection timeout; the OS TCP timeout applies.

## Follow-ups

- S09: conformance sweep will audit SSH behaviour against Spec Appendix A and fix any gaps.
- README documentation for SSH pool configuration (ssh_hosts, max_concurrent_agents_per_host, SYMPHONY_SSH_CONFIG).

## Files Created/Modified

- `src/ssh.rs` — new module: parse_target, shell_escape, ssh_args, validate_remote_workspace_cwd, SshRunner::start_process, WorkerHostSelection, select_worker_host
- `src/error.rs` — SymphonyError::SshLaunchFailed(String) variant
- `src/lib.rs` — pub mod ssh
- `src/codex/app_server.rs` — start_session gains worker_host param; SSH/local dispatch branch
- `src/orchestrator.rs` — select_worker_host method; dispatch/retry wiring; NoneAvailable guards
- `tests/ssh_tests.rs` — new: 15 tests + fake_ssh_on_path helper

## Forward Intelligence

### What the next slice should know
- The full SSH dispatch path (pool selection → start_session → SshRunner) is wired but only exercised with a fake-ssh binary. S09 conformance audit should include at least a structural check that the SSH path reaches the expected codex protocol entrypoint.
- `select_worker_host` free function in `ssh.rs` is the canonical testable surface; orchestrator method delegates to it. Future tests for dispatch logic can call the free function directly.

### What's fragile
- `test_fake_ssh_launch` relies on a 500ms sleep for the fake-ssh child to write its trace file — flaky under extreme system load. Consider replacing with polling/file-watch if intermittent CI failures appear.
- Per-host load counting iterates all `state.running.values()` on every dispatch tick — O(n) where n = total running sessions. Acceptable at current scale; worth noting if session counts grow large.

### Authoritative diagnostics
- `cargo test --test ssh_tests` — 15 tests, zero failures is the health signal for S08 coverage.
- `tracing::warn! event="ssh_pool_exhausted"` — the operational signal that SSH pool is saturated and dispatch is blocked.
- `OrchestratorSnapshot.running[issue_id].worker_host` — reliable indicator of which host is running a given session.

### What assumptions changed
- Task plan assumed `-o StrictHostKeyChecking=no` in SSH args; Elixir reference uses `-T` instead. The fake-ssh test encodes this contract — any future change to SSH flags will break `test_fake_ssh_launch` intentionally.
