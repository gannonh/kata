---
id: T04
parent: S08
milestone: M001
provides:
  - select_worker_host public function in src/ssh.rs (takes ssh_hosts, load map, cap, preferred)
  - select_worker_host method on Orchestrator in src/orchestrator.rs (builds load from state.running)
  - Fresh dispatch wired to select_worker_host(None) with NoneAvailable guard
  - Retry dispatch wired to select_worker_host(retry.worker_host.as_deref()) with NoneAvailable reschedule
key_files:
  - src/ssh.rs
  - src/orchestrator.rs
  - tests/ssh_tests.rs
key_decisions:
  - select_worker_host implemented as a public free function in ssh.rs (not just orchestrator method) so tests can call it directly with explicit parameters; orchestrator method delegates to it
  - NoneAvailable in retry path reschedules via schedule_retry_with_context rather than silently dropping the retry
  - test_fake_ssh_launch sleep increased 200ms→500ms to prevent timing flakiness under full-suite parallel execution
patterns_established:
  - select_worker_host(ssh_hosts, load, cap, preferred) encodes the three-way eligibility check (empty pool→Local, preferred under cap→prefer, else least-loaded by (count,index) tiebreak, all full→NoneAvailable)
  - WorkerHostSelection match in dispatch/retry: NoneAvailable→early return with tracing::warn!, Remote→Some(host), Local→None
observability_surfaces:
  - tracing::warn! event="ssh_pool_exhausted" on fresh dispatch block
  - tracing::warn! event="ssh_pool_exhausted_retry" on retry dispatch block
  - OrchestratorSnapshot.running[issue_id].worker_host is Some("host") for remote sessions, None for local
  - RetryEntry.worker_host carries host preference into next retry attempt
duration: 1 session
verification_result: passed
completed_at: 2026-03-19
blocker_discovered: false
---

# T04: Implement `select_worker_host` and wire dispatch + retry propagation in `orchestrator.rs`

**Added `select_worker_host` to `ssh.rs` and wired it into both fresh dispatch and retry paths in `orchestrator.rs`, closing the S08 slice with all 15 ssh_tests green and full suite passing.**

## What Happened

Added a public `select_worker_host(ssh_hosts, load, cap, preferred) -> WorkerHostSelection` free function to `src/ssh.rs`. The function encodes the Elixir host-selection algorithm: returns `Local` when the pool is empty, prefers the caller-supplied host when eligible (under cap), otherwise picks the least-loaded eligible host by `(count, index)` tiebreak, and returns `NoneAvailable` when all hosts are at or above cap.

Added a `select_worker_host(&self, preferred: Option<&str>) -> WorkerHostSelection` method on `Orchestrator` in `src/orchestrator.rs` that builds the current per-host load from `self.state.running.values()` and delegates to the `ssh::select_worker_host` free function.

Wired the method into the fresh dispatch loop: before calling `dispatch_issue`, the orchestrator calls `select_worker_host(None)`. On `NoneAvailable` it logs `tracing::warn!(event="ssh_pool_exhausted")` and skips the issue (same `continue` pattern as global-cap-full). On `Remote(host)` it passes `Some(host)` to `dispatch_issue`; on `Local` it passes `None`.

Wired the method into the retry dispatch path: before calling `dispatch_issue` for a due retry, the orchestrator calls `select_worker_host(retry.worker_host.as_deref())`. On `NoneAvailable` it reschedules via `schedule_retry_with_context` with cause `"ssh pool exhausted"` (rather than silently dropping the retry), logs `tracing::warn!(event="ssh_pool_exhausted_retry")`, and continues. On `Remote`/`Local` it dispatches as normal.

Updated `tests/ssh_tests.rs` to import `select_worker_host` from `symphony::ssh` (replacing the local `todo!()` stub) and increased the `test_fake_ssh_launch` sleep from 200ms to 500ms to eliminate timing flakiness observed when the full test suite runs in parallel.

## Verification

```
cargo test --test ssh_tests   # 15/15 pass
cargo test                    # all test binaries green, zero warnings
cargo build                   # zero warnings
```

Must-haves confirmed:
- [x] `select_worker_host` returns `Local` when `ssh_hosts` is empty — `test_select_worker_host_local_mode` passes
- [x] Prefers preferred host when under cap — `test_select_worker_host_prefers_prior_host` passes
- [x] Skips full host, picks least-loaded alternative — `test_select_worker_host_skips_full_host` passes
- [x] Returns `NoneAvailable` when all hosts at cap — `test_select_worker_host_blocks_when_all_full` passes
- [x] Fresh dispatch uses `select_worker_host(None)`, retry uses `select_worker_host(retry.worker_host.as_deref())`
- [x] `NoneAvailable` causes early return (no dispatch, no fallback to local)
- [x] All 15 ssh_tests pass; full `cargo test` suite passes

## Diagnostics

- `OrchestratorSnapshot.running[issue_id].worker_host` — `Some("host")` for remote sessions, `None` for local
- `tracing::warn! event="ssh_pool_exhausted"` — fires when fresh dispatch skipped due to pool exhaustion; includes `issue_id`, `issue_identifier`
- `tracing::warn! event="ssh_pool_exhausted_retry"` — fires when retry blocked; includes `issue_id`, `issue_identifier`
- `RetryEntry.worker_host` — carries preferred host into next retry; set from `RunAttempt.worker_host` at line 485 (verified unchanged)

## Deviations

- `select_worker_host` implemented as a **public free function in `ssh.rs`** in addition to an orchestrator method, so the existing test-file stubs could be replaced by a direct import rather than requiring an integration test harness around `Orchestrator`. The task plan described only the orchestrator method; the free function approach keeps tests clean and avoids coupling test setup to `Orchestrator` construction.
- `test_fake_ssh_launch` sleep increased from 200ms to 500ms to address pre-existing timing flakiness in full parallel suite runs (not introduced by T04 changes; the test was already intermittently failing in the T03 baseline).

## Known Issues

None.

## Files Created/Modified

- `src/ssh.rs` — added `select_worker_host` public free function + `use std::collections::HashMap`
- `src/orchestrator.rs` — added `use crate::ssh::{self, WorkerHostSelection}`, `select_worker_host` orchestrator method, and dispatch/retry wiring with `NoneAvailable` guards
- `tests/ssh_tests.rs` — replaced local `todo!()` stub with `select_worker_host` import; sleep 200ms→500ms
