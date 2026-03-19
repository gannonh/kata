---
estimated_steps: 5
estimated_files: 7
---

# T04: Wire orchestrator host-pool dispatch, affinity, and snapshot diagnostics

**Slice:** S08 — SSH Remote Worker Extension
**Milestone:** M001

## Description

Finish the slice by teaching the orchestrator to actually use SSH workers: choose a host from the pool, enforce per-host caps, keep retries and continuations on the right host when possible, and expose host-aware state in runtime diagnostics and snapshots.

## Steps

1. Add orchestrator host-selection logic for first dispatches using `worker.ssh_hosts` and `max_concurrent_agents_per_host`, with no silent local fallback when all SSH hosts are full.
2. Reuse existing retry/continuation metadata (`worker_host`, `workspace_path`, `session_id`) so continuation turns stay on the same host/workspace and retries prefer the previous host when capacity permits.
3. Wire worker execution to call the new remote workspace + SSH app-server paths whenever SSH hosts are configured, while preserving the existing local path for non-SSH workers.
4. Extend snapshot/runtime diagnostics so running entries, retry queue entries, and failure events retain `worker_host`, remote workspace path, and host-capacity failure context.
5. Make the full S08 verification suite pass and run `cargo build` to confirm integrated runtime composition remains healthy.

## Must-Haves

- [ ] First-run dispatches select a host from the configured pool and record it in runtime state
- [ ] Per-host concurrency caps are enforced across the pool, and all-hosts-full results in no dispatch rather than local fallback
- [ ] Continuation runs stay on the same host/workspace; retries prefer the previous host when capacity allows
- [ ] Running/retry snapshot state and runtime diagnostics preserve `worker_host` and remote workspace identity
- [ ] Full S08 verification and `cargo build` pass together, proving composed runtime behavior

## Verification

- `cargo test --test orchestrator_tests --test ssh_tests --test codex_tests --test workspace_tests`
- `cargo build`

## Observability Impact

- Signals added/changed: Scheduler runtime events and snapshot entries now expose host-pool decisions, capacity exhaustion, and host affinity as stable diagnostics.
- How a future agent inspects this: `tests/orchestrator_tests.rs` plus snapshot assertions identify whether failures happen at selection, retry affinity, or remote execution wiring.
- Failure state exposed: All-hosts-full, remote launch failure on a chosen host, and lost continuation affinity become visible in runtime state rather than hidden scheduler behavior.

## Inputs

- `src/orchestrator.rs` — S06 single-authority scheduler, retry queue, and snapshot publication seams
- `src/codex/app_server.rs` — SSH-capable transport seam from T03
- `src/workspace.rs` — remote workspace lifecycle from T02
- `src/domain.rs` — `RunAttempt`, retry snapshot, and worker configuration types carrying `worker_host`
- `.kata/milestones/M001/slices/S06/S06-SUMMARY.md` — host-affinity state already preserved through retries and completions

## Expected Output

- `src/orchestrator.rs` — host-pool selection/capacity/affinity logic wired into dispatch and retries
- `tests/orchestrator_tests.rs` — passing S08 host-pool and host-affinity assertions
- `src/domain.rs` / `src/workspace.rs` / `src/codex/app_server.rs` — integrated runtime surfaces carrying remote host/workspace diagnostics
