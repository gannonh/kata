# S08: SSH Remote Worker Extension

**Goal:** Wire SSH-based remote agent dispatch end-to-end: `ssh.rs` constructs and launches SSH subprocesses, `app_server.rs` accepts an optional `worker_host` and routes to SSH or local spawn accordingly, and `orchestrator.rs` selects a host from the SSH pool with per-host cap enforcement, host-preference on retry, and blocking when the pool is exhausted.
**Demo:** `cargo test --test ssh_tests` passes 12+ tests covering SSH arg construction, host:port parsing, shell escaping, SYMPHONY_SSH_CONFIG injection, host-selection (prefer-on-retry, least-loaded tiebreaker, cap blocking), and remote workspace path validation. `cargo build` clean.

## Must-Haves

- `src/ssh.rs` implements `parse_target()`, `shell_escape()`, `ssh_args()`, and `SshRunner::start_process()` matching Elixir SSH module behavior
- `src/codex/app_server.rs:start_session` accepts `worker_host: Option<&str>`; routes to SSH subprocess when `Some`, keeps existing local `bash -lc` path when `None`
- Remote workspace cwd validation uses `validate_remote_workspace_cwd` (non-empty, absolute path string) instead of local canonicalization
- `src/orchestrator.rs:select_worker_host()` implements pool selection: prefer prior host on retry, least-loaded fallback with index tiebreaker, cap enforcement, blocking when all hosts full
- `orchestrator.rs` dispatch path populates `RunAttempt.worker_host` from `select_worker_host()` result (replaces hard-coded `None`)
- `worker_host` propagates `RunAttempt → RetryEntry → select_worker_host` on retry (existing fields, new wiring)
- When `ssh_hosts` is empty, local mode is used; when non-empty and all hosts are at capacity, dispatch is blocked (no silent fallback to local)
- `SYMPHONY_SSH_CONFIG` env var injected as `-F <path>` when set
- `cargo test --test ssh_tests` passes; `cargo test` clean

## Proof Level

- This slice proves: integration (SSH subprocess wiring with fake-ssh binary, host-selection unit tests on orchestrator state)
- Real runtime required: no (fake ssh script on PATH for subprocess tests; pure unit tests for host selection)
- Human/UAT required: no

## Verification

```
cargo test --test ssh_tests
# All ssh_tests pass (12+ tests)

cargo test
# Full suite passes; no regressions
```

Test file: `tests/ssh_tests.rs`

Tests must include:
- `test_parse_target_plain_host` — `host` → `-p 22 host` (default port)
- `test_parse_target_host_port` — `host:2222` → `-p 2222 host`
- `test_parse_target_user_at_host_port` — `user@host:2200` → `-p 2200 user@host`
- `test_parse_target_ipv6_bracketed` — `[::1]:2222` → `-p 2222 [::1]`
- `test_parse_target_ipv6_unbracketed` — `::1` treated as bare hostname (no port split)
- `test_shell_escape` — string with single quotes correctly escaped with POSIX quoting
- `test_ssh_args_no_config` — no `SYMPHONY_SSH_CONFIG` set → no `-F` flag
- `test_ssh_args_with_config` — `SYMPHONY_SSH_CONFIG=/tmp/ssh.conf` → `-F /tmp/ssh.conf` present
- `test_fake_ssh_launch` — fake ssh script traces args to file; assert expected args recorded
- `test_select_worker_host_prefers_prior_host` — retry with preferred host still under cap → preferred selected
- `test_select_worker_host_skips_full_host` — preferred host at cap → least-loaded alternative selected
- `test_select_worker_host_blocks_when_all_full` — all hosts at cap → `NoneAvailable`
- `test_select_worker_host_local_mode` — empty `ssh_hosts` → `Local`
- `test_remote_workspace_validation_accepts_absolute` — absolute path passes
- `test_remote_workspace_validation_rejects_relative` — relative path returns error

## Observability / Diagnostics

- Runtime signals: `tracing::info!` on SSH session spawn (host, issue_id, session_id, pid); `tracing::warn!` when pool is full and dispatch is blocked; `tracing::debug!` for SSH args construction
- Inspection surfaces: `OrchestratorSnapshot.running[*].worker_host` exposes which host is running each issue; retry entries carry `worker_host` for next-attempt host preference
- Failure visibility: `SymphonyError::SshLaunchFailed(String)` variant with host and exit code; `NoneAvailable` pool-exhaustion path logs at WARN with per-host load counts
- Redaction constraints: none (host names are not secrets)

## Integration Closure

- Upstream surfaces consumed: `src/codex/app_server.rs:start_session`, `src/orchestrator.rs:RunAttempt/RetryEntry`, `src/domain.rs:WorkerConfig` (already has `ssh_hosts`, `max_concurrent_agents_per_host`)
- New wiring introduced in this slice: `src/ssh.rs` (new module), `app_server::start_session` worker_host branch, `orchestrator::select_worker_host` + dispatch wiring, `lib.rs` pub mod ssh
- What remains before the milestone is truly usable end-to-end: S09 conformance sweep and README documentation

## Tasks

- [ ] **T01: Create `tests/ssh_tests.rs` red suite and `src/ssh.rs` stub** `est:45m`
  - Why: Establishes the verification target (all tests red) and module skeleton before implementation; follows the red→green discipline used in S05/S06
  - Files: `tests/ssh_tests.rs`, `src/ssh.rs`, `src/lib.rs`
  - Do: Create `src/ssh.rs` with stub signatures (`parse_target`, `shell_escape`, `ssh_args`, `SshRunner::start_process`). Add `pub mod ssh` to `src/lib.rs`. Write all 15 test cases in `tests/ssh_tests.rs` with assertions on expected behavior — they should fail because stubs return `todo!()`. Include fake-ssh-on-PATH helper: write a temp shell script that appends its args to a trace file, prepend its dir to `PATH` env for the subprocess test. Add `SymphonyError::SshLaunchFailed(String)` variant to `src/error.rs`. Add `WorkerHostSelection` enum (`Local`, `Remote(String)`, `NoneAvailable`) to `src/ssh.rs` or `src/domain.rs`.
  - Verify: `cargo test --test ssh_tests 2>&1 | grep "FAILED\|error\[" | head -20` — all tests fail (compile or runtime), none pass yet
  - Done when: All 15 test functions exist, compile with stub bodies, and fail at runtime (not compile-error)

- [ ] **T02: Implement `src/ssh.rs` — arg construction, shell escape, host:port parsing, subprocess launch** `est:60m`
  - Why: Makes the `ssh_tests` SSH-module tests pass; provides the building block that `app_server.rs` uses for remote dispatch
  - Files: `src/ssh.rs`, `src/error.rs`
  - Do: Implement `parse_target(target: &str) -> (String, u16)` matching Elixir regex `^(.*):(\d+)$` with IPv6 bracketing guard (`valid_port_destination?` = destination doesn't start/end with `[`/`]` unless both present). Default port 22 when no port suffix matched. Implement `shell_escape(s: &str) -> String` using POSIX single-quote wrapping with embedded `'` replaced by `'"'"'`. Implement `ssh_args(host: &str, command: &str) -> Vec<String>` building `["-p", port, host_part, "--", "bash", "-lc", shell_escaped_command]` plus optional `-F config_path` from `std::env::var("SYMPHONY_SSH_CONFIG")`. Implement `SshRunner::start_process(host: &str, command: &str) -> Result<tokio::process::Child>` using `tokio::process::Command` with piped stdin/stdout/stderr.
  - Verify: `cargo test --test ssh_tests test_parse_target_ test_shell_escape test_ssh_args test_fake_ssh` — all parsing + launch tests pass
  - Done when: 10+ SSH-module tests pass; fake-ssh trace file contains expected args

- [ ] **T03: Add SSH transport branch to `app_server::start_session` and remote workspace validation** `est:45m`
  - Why: Wires the SSH module into the Codex session lifecycle so remote agent dispatch is possible without changing the turn-streaming code
  - Files: `src/codex/app_server.rs`
  - Do: Add `worker_host: Option<&str>` parameter to `start_session` (after `workspace_root`). When `None`: keep existing `validate_workspace_cwd` + `tokio::process::Command::new("bash")` path. When `Some(host)`: call `validate_remote_workspace_cwd(workspace_path_str) -> Result<String>` (checks non-empty + absolute path string without local FS canonicalization), then use `SshRunner::start_process(host, &cmd_str)` to spawn the child. The `do_start_session`, turn streaming, `drain_stderr`, and all downstream handlers are unchanged. Log `worker_host` in the session-start trace span. Update all call sites in `orchestrator.rs` to pass `worker_host: None` (preserving current behavior; S08 wires real values in T04).
  - Verify: `cargo test --test codex_tests` — all 32 existing tests pass (none regressed); `cargo build` clean
  - Done when: `start_session` compiles with new signature; all codex_tests pass; remote validation unit tests in ssh_tests pass

- [ ] **T04: Implement `select_worker_host` and wire dispatch + retry propagation in `orchestrator.rs`** `est:60m`
  - Why: Closes the slice goal — host selection, per-host cap enforcement, and retry-preference propagation make SSH dispatch operationally correct
  - Files: `src/orchestrator.rs`
  - Do: Implement `select_worker_host(&self, preferred: Option<&str>) -> WorkerHostSelection`: if `ssh_hosts` empty → `Local`; else count per-host running entries from `self.state.running.values()`; filter hosts where count < `max_concurrent_agents_per_host` (default unlimited = u32::MAX); if preferred host is in filtered set → pick it; else pick least-loaded by `(count, index)` tuple for deterministic tiebreak; if no host available → `NoneAvailable`. In `dispatch_issue`: call `select_worker_host(None)` for fresh dispatch, `select_worker_host(retry.worker_host.as_deref())` for retry dispatch. On `NoneAvailable`: log WARN, return early (same as global cap full). On `Remote(host)`: pass `worker_host: Some(&host)` to `start_session`; store `Some(host)` in `RunAttempt.worker_host`. On `Local`: pass `worker_host: None` (as before). Ensure `RetryEntry.worker_host` is already set from `RunAttempt.worker_host` on failure (it is — line 485); confirm the retry dispatch path reads it and passes to `select_worker_host`.
  - Verify: `cargo test --test ssh_tests test_select_worker_host` — all 4 host-selection tests pass; `cargo test` — full suite clean
  - Done when: All 15 ssh_tests pass; full `cargo test` suite passes with zero regressions

## Files Likely Touched

- `src/ssh.rs` (new)
- `src/error.rs`
- `src/domain.rs` (WorkerHostSelection enum, or in ssh.rs)
- `src/lib.rs` (pub mod ssh)
- `src/codex/app_server.rs`
- `src/orchestrator.rs`
- `tests/ssh_tests.rs` (new)
