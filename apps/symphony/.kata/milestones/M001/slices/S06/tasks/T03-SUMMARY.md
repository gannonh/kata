---
id: T03
parent: S06
milestone: M001
provides:
  - Implemented worker lifecycle completion/failure/stall handling with retry scheduling, stale-token suppression, and aggregate token/rate-limit accounting in orchestrator runtime state
key_files:
  - src/orchestrator.rs
  - tests/orchestrator_tests.rs
  - .kata/DECISIONS.md
key_decisions:
  - "D037: Keep worker session IDs in orchestrator-owned runtime map so retry/stall/completion diagnostics retain session context without widening domain structs yet"
patterns_established:
  - "Retry scheduling pattern: continuation always +1s, failure retries exponential with cap, and token/nonce validation guards stale timer firings"
  - "Worker observability pattern: emit structured lifecycle events with issue/session metadata and persist retry diagnostics into snapshot-ready state"
observability_surfaces:
  - "RuntimeEvent stream: worker_completed, worker_failed, worker_stalled, retry_scheduled, retry_ignored_stale"
  - "OrchestratorSnapshot.retry_queue + codex_totals/codex_rate_limits"
  - "Structured tracing fields: issue_id, issue_identifier, session_id, attempt, due_at_ms"
duration: 95m
verification_result: passed
completed_at: 2026-03-18T20:14:22Z
blocker_discovered: false
---

# T03: Add worker lifecycle integration, retries, stall recovery, and token accounting

**Shipped orchestrator worker-lifecycle control paths for continuation/failure retries, stale retry suppression, stall-triggered recovery, and codex token/rate-limit aggregation with structured issue/session diagnostics.**

## What Happened

Implemented T03 runtime behaviors in `src/orchestrator.rs`:

- Added full retry-delay semantics:
  - continuation retries are fixed at `+1000ms`
  - failure retries use capped exponential backoff (`10000 * 2^(attempt-1)` capped by `agent.max_retry_backoff_ms`)
- Added retry token/nonce validation in `fire_retry` so stale timer firings are ignored and emit explicit `retry_ignored_stale` diagnostics instead of consuming active queue entries.
- Added worker lifecycle completion API (`handle_worker_completion`) with distinct success/failure paths:
  - success queues continuation attempt 1 with session/worker/workspace context
  - failure preserves/increments attempt and queues backoff retry with error context
- Added agent-event ingestion (`ingest_agent_event`) to update last-activity timestamps and session correlation context for stall and retry diagnostics.
- Implemented stall detection using last codex activity timestamp fallback to `started_at`, and on timeout schedules forced failure retry with explicit reason.
- Implemented aggregate token/rate-limit accumulation in `apply_turn_metrics`, updating snapshot-visible codex totals and latest rate-limit payload.
- Added execution wiring entrypoint (`execute_worker_attempt`) that composes workspace setup/hooks, prompt rendering, codex session lifecycle (`start_session`/`run_turn`/`stop_session`), event ingestion, and completion handling.
- Added/updated orchestrator tests to verify lifecycle observability details (session context on completion/failure, retry metadata retention).

Also appended **D037** in `.kata/DECISIONS.md` for session-context storage strategy.

## Verification

Task-level verification (required by T03 plan):

- `cargo test --test orchestrator_tests test_retry` ✅
- `cargo test --test orchestrator_tests test_stall` ✅
- `cargo test --test orchestrator_tests test_token` ✅

Additional targeted checks:

- `cargo test --test orchestrator_tests` ✅ (14/14 passing)
- `cargo test --test orchestrator_tests test_worker_` ✅ (new lifecycle assertions)

Slice-level verification status (run per S06 plan):

- `cargo test --test orchestrator_tests --test cli_tests` ⚠️ partial (orchestrator suite passes; 2 CLI tests still failing, expected for pending T04 bootstrap wiring)
- `cargo build` ✅

## Diagnostics

Future inspection paths for this task:

- Runtime event stream (`orchestrator.events()`):
  - `RetryScheduled { retry_kind, attempt, due_at_ms, token }`
  - `RetryIgnoredStale { issue_id, token }`
  - `WorkerCompleted { issue_id, issue_identifier, session_id }`
  - `WorkerFailed { issue_id, issue_identifier, session_id, error }`
  - `WorkerStalled { issue_id, issue_identifier, session_id, elapsed_ms }`
- Snapshot diagnostics (`orchestrator.snapshot(now_ms)`):
  - `retry_queue` entries include `attempt`, `due_in_ms`, `error`, `worker_host`, `workspace_path`
  - `codex_totals` and `codex_rate_limits` expose aggregate telemetry for dashboard/API surfaces
- Structured tracing fields include issue/session correlation (`issue_id`, `issue_identifier`, `session_id`) on retry/lifecycle/token updates.

## Deviations

None.

## Known Issues

- S06 slice-level CLI verification remains red (`tests/cli_tests.rs` startup validation/start orchestration path assertions). This is planned for **T04** and does not block T03 contract completion.

## Files Created/Modified

- `src/orchestrator.rs` — implemented retry semantics, stale token suppression, stall recovery, token aggregation, event ingestion, lifecycle diagnostics, and worker attempt execution wiring.
- `tests/orchestrator_tests.rs` — updated and expanded retry/stall/token/lifecycle assertions for T03 behavior.
- `.kata/DECISIONS.md` — appended D037 observability/storage decision for worker session correlation context.
- `.kata/milestones/M001/slices/S06/tasks/T03-SUMMARY.md` — task summary artifact.
