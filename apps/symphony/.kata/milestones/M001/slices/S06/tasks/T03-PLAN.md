---
estimated_steps: 5
estimated_files: 4
---

# T03: Add worker lifecycle integration, retries, stall recovery, and token accounting

**Slice:** S06 — Orchestrator Core
**Milestone:** M001

## Description

Complete the runtime control loop by integrating worker execution outcomes with retry scheduling, stall recovery, and aggregate Codex telemetry. This task closes the highest-risk correctness paths for R006 and advances R009/R015 support.

## Steps

1. Implement worker attempt execution wiring in orchestrator (workspace ensure/hooks, prompt render, codex start/run/stop) and ingest `AgentEvent` updates for last activity/session context.
2. Implement completion handling with continuation retry after successful turn (attempt 1 at 1s) and failure retries using exponential backoff capped by `max_retry_backoff_ms`.
3. Introduce retry token/nonce tracking so superseded timer firings are ignored safely; expose retry metadata in snapshot state.
4. Implement stall detection using `last_codex_timestamp` vs `stall_timeout_ms`, terminate stalled runs, and schedule retry with explicit failure reason.
5. Accumulate turn token deltas and latest rate-limit payload into aggregate orchestrator totals and make all retry/stall/token tests pass.

## Must-Haves

- [ ] Continuation retries (attempt 1) are scheduled at 1000ms after normal completion
- [ ] Failure retries follow capped exponential backoff and preserve attempt count
- [ ] Stale retry timer firings are ignored by token/nonce validation
- [ ] Stall detection uses last Codex activity timestamp (not just start time)
- [ ] Snapshot exposes retry queue diagnostics (attempt, due, error, worker_host/workspace when present)
- [ ] Aggregate token totals and latest rate-limit info update from turn results/events
- [ ] Worker lifecycle logs include issue/session context fields for diagnosis

## Verification

- `cargo test --test orchestrator_tests test_retry`
- `cargo test --test orchestrator_tests test_stall`
- `cargo test --test orchestrator_tests test_token`

## Observability Impact

- Signals added/changed: `retry_scheduled`, `retry_ignored_stale`, `worker_stalled`, `worker_completed`, `worker_failed`, and token aggregate update logs.
- How a future agent inspects this: `OrchestratorSnapshot` exposes retry queue and codex totals; orchestrator tests assert on structured event capture.
- Failure state exposed: last error reason, retry attempt number, due time, and stall-triggered retry path become inspectable without attaching a debugger.

## Inputs

- `src/orchestrator.rs` — scheduler spine from T02
- `src/codex/app_server.rs` — session lifecycle + `TurnResult` token/rate-limit fields
- `src/workspace.rs` and `src/prompt_builder.rs` — worker preparation and prompt rendering
- `tests/orchestrator_tests.rs` — failing retry/stall/token assertions

## Expected Output

- `src/orchestrator.rs` — worker lifecycle + retry/stall/token accounting behavior implemented
- `src/domain.rs` — any runtime/snapshot metadata extensions required for observability
- `tests/orchestrator_tests.rs` — retry/stall/token sections passing
- `src/codex/app_server.rs` — only minimal compatibility tweaks if required by orchestrator wiring
