---
estimated_steps: 5
estimated_files: 2
---

# T04: Implement `select_worker_host` and wire dispatch + retry propagation in `orchestrator.rs`

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Implement the host-selection algorithm and wire it into the orchestrator dispatch path. This closes the slice: `RunAttempt.worker_host` is populated from pool selection, `RetryEntry.worker_host` propagates it to the next dispatch attempt, and the pool-exhaustion guard blocks dispatch without falling back to local execution.

## Steps

1. Add `pub use ssh::WorkerHostSelection;` or import it in `orchestrator.rs`. Implement `select_worker_host(&self, preferred: Option<&str>) -> WorkerHostSelection`:
   - If `self.config.worker.ssh_hosts` is empty → return `WorkerHostSelection::Local`.
   - Count running entries per host: `let mut counts: HashMap<&str, usize>` from `self.state.running.values().filter_map(|r| r.worker_host.as_deref())`.
   - `max_cap = self.config.worker.max_concurrent_agents_per_host.unwrap_or(u32::MAX) as usize`.
   - Build list of eligible hosts: `ssh_hosts.iter().enumerate().filter(|(_, h)| counts.get(h.as_str()).copied().unwrap_or(0) < max_cap)`.
   - If `preferred` is set and is in the eligible list → return `WorkerHostSelection::Remote(preferred.to_string())`.
   - Otherwise pick least-loaded eligible host by `(count, index)` tuple (deterministic tiebreak): `eligible.min_by_key(|(i, h)| (counts.get(h.as_str()).copied().unwrap_or(0), *i))`.
   - If no eligible host → return `WorkerHostSelection::NoneAvailable`.

2. In `dispatch_issue` (fresh dispatch path, around line 687 in orchestrator.rs):
   - Call `let host_selection = self.select_worker_host(None);`
   - Match on `NoneAvailable` → `tracing::warn!("SSH host pool exhausted, deferring dispatch"); return Ok(());` (same early-return as global-cap-full).
   - `Remote(ref host)` → pass `worker_host: Some(host.as_str())` to `start_session`; set `RunAttempt.worker_host = Some(host.clone())`.
   - `Local` → pass `worker_host: None`; `RunAttempt.worker_host = None` (as before).

3. In the retry dispatch path (around line 1187 in orchestrator.rs where `retry.worker_host` is consumed):
   - Call `let host_selection = self.select_worker_host(retry.worker_host.as_deref());`
   - Apply same `NoneAvailable` / `Remote` / `Local` branching as above.

4. Update the `RunAttempt` construction at line 687 to use the resolved `worker_host` from `host_selection` (replace `worker_host: None`).

5. Confirm `RetryEntry.worker_host` is set from `RunAttempt.worker_host` on failure (line 485 — already wired; just verify it reads `context.worker_host.clone()`).

## Must-Haves

- [ ] `select_worker_host` returns `Local` when `ssh_hosts` is empty
- [ ] `select_worker_host` prefers the preferred host when it is under cap
- [ ] `select_worker_host` skips a full host and picks least-loaded alternative
- [ ] `select_worker_host` returns `NoneAvailable` when all hosts are at cap
- [ ] Fresh dispatch uses `select_worker_host(None)`; retry dispatch uses `select_worker_host(retry.worker_host.as_deref())`
- [ ] `NoneAvailable` causes early return (no dispatch, no fallback to local)
- [ ] All 15 ssh_tests pass; full `cargo test` suite passes

## Verification

- `cargo test --test ssh_tests` → 15 tests pass
- `cargo test` → full suite green (no regressions in orchestrator_tests, codex_tests, etc.)
- `cargo build` → zero warnings

## Observability Impact

- Signals added/changed: `tracing::warn!` when pool is exhausted; `RunAttempt.worker_host` in snapshot shows which host runs each issue; `RetryEntry.worker_host` carries host preference into next retry
- How a future agent inspects this: `OrchestratorSnapshot.running[issue_id].worker_host` is `Some("host")` for remote sessions, `None` for local; pool-exhaustion warn log includes per-host load context
- Failure state exposed: `NoneAvailable` branch logs host pool state at WARN; `SshLaunchFailed` carries failure details from remote spawn

## Inputs

- `src/orchestrator.rs` — dispatch path at ~line 687, retry path at ~line 1187, `RunAttempt` struct at line 196
- `src/ssh.rs` — `WorkerHostSelection` enum from T01, `SshRunner::start_process` from T02
- `src/codex/app_server.rs` — `start_session` with `worker_host` param from T03
- Elixir reference: `orchestrator.ex` lines 973–1010 (`select_worker_host`); `agent_runner.ex` lines 191–210 (`candidate_worker_hosts`)
- Elixir tests: `core_test.exs` lines 706–751 (3 host-selection test cases)

## Expected Output

- `src/orchestrator.rs` — `select_worker_host` method + dispatch/retry wiring (~60 new lines)
- `tests/ssh_tests.rs` — all 15 tests pass
- Full `cargo test` suite green: R011 validated
