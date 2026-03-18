---
id: S06
parent: M001
milestone: M001
provides:
  - Orchestrator authority loop with reconcile→validate→dispatch ordering, candidate gating/sorting, bounded concurrency, retries, stall recovery, and snapshot diagnostics
requires:
  - slice: S02
    provides: WorkflowStore effective config + validation boundary used for startup and per-tick preflight checks
  - slice: S03
    provides: TrackerAdapter contract used for startup terminal cleanup, reconcile refresh, and candidate retrieval
  - slice: S04
    provides: Workspace + prompt builder integration points consumed by worker attempt execution
  - slice: S05
    provides: Codex session lifecycle, AgentEvent stream, and turn-level token/rate-limit metrics
affects:
  - S07
  - S08
  - S09
key_files:
  - src/orchestrator.rs
  - src/main.rs
  - tests/orchestrator_tests.rs
  - tests/cli_tests.rs
  - .kata/REQUIREMENTS.md
key_decisions:
  - D036 — maintain normalized running issue state cache for deterministic per-state slot accounting
  - D037 — persist worker session-id correlation in orchestrator-owned diagnostics map
  - D038 — standardize CLI startup/runtime lifecycle logs as JSON fields (`phase`, `stage`, `workflow_path`)
patterns_established:
  - Reconcile-first scheduler pipeline before dispatch on every tick
  - Retry scheduling with token/nonce stale-fire suppression
  - Bootstrap stage-gate pipeline (exists → validate → start) with stage-specific failures
observability_surfaces:
  - RuntimeEvent stream (`Reconcile`, `Validate`, `Dispatch`, `ValidationSkippedDispatch`, `RetryScheduled`, `RetryIgnoredStale`, `WorkerStalled`)
  - `OrchestratorSnapshot` (running, retry queue, codex totals, latest rate limits)
  - Structured startup/runtime logs with actionable stage context
  - `cargo test --test orchestrator_tests -- --nocapture`
drill_down_paths:
  - .kata/milestones/M001/slices/S06/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S06/tasks/T02-SUMMARY.md
  - .kata/milestones/M001/slices/S06/tasks/T03-SUMMARY.md
  - .kata/milestones/M001/slices/S06/tasks/T04-SUMMARY.md
duration: 323m
verification_result: passed
completed_at: 2026-03-18T20:28:16Z
---

# S06: Orchestrator Core

**Shipped the orchestrator runtime control-plane and CLI bootstrap so Symphony now executes and proves the full poll→reconcile→dispatch→retry contract with deterministic diagnostics.**

## What Happened

S06 moved the project from isolated subsystem implementations into a functioning runtime authority loop.

- T01 established the contract-first red suite and test seams for orchestrator and CLI behavior.
- T02 implemented the scheduler spine: startup terminal cleanup, reconcile-first tick sequencing, per-tick dispatch preflight validation, candidate eligibility/order rules, and global/per-state dispatch slot enforcement.
- T03 completed worker lifecycle control: continuation/failure retry scheduling, exponential backoff cap, stale retry token suppression, stall-triggered retries, session-context diagnostics, and aggregate codex token/rate-limit accounting.
- T04 replaced placeholder main with a real staged bootstrap (`workflow_exists` → `startup_validate` → `start_orchestrator`), deterministic non-zero startup failure behavior, and graceful shutdown path.

Net result: `src/orchestrator.rs` is now the runtime authority, and `src/main.rs` now performs real startup validation and orchestrator launch semantics instead of placeholders.

## Verification

Executed slice-level verification commands from the plan:

- `cargo test --test orchestrator_tests --test cli_tests` ✅ (19/19 passing)
- `cargo build` ✅

Executed observability checks to confirm failure visibility is real and actionable:

- `RUST_LOG=info cargo run -- missing/WORKFLOW.md` ✅ emits structured startup failure with `phase`, `stage`, `workflow_path`, error; exits code 1.
- `RUST_LOG=info cargo run -- <invalid-workflow>` ✅ emits startup validation failure with deterministic message (`invalid startup config: missing Linear API token`); exits code 1.

## Requirements Advanced

- R009 — Added and verified structured lifecycle diagnostics with issue/session context in orchestrator runtime events and startup-stage error logging.
- R010 — Finalized the snapshot surfaces (`running`, retry diagnostics, codex totals/rate limits, poll status) that S07 HTTP endpoints will expose.

## Requirements Validated

- R006 — Orchestrator state-machine behavior proven by `tests/orchestrator_tests.rs` (ordering, gating, retries, stall recovery, startup cleanup).
- R008 — CLI entrypoint behavior proven by `tests/cli_tests.rs` (path parse defaults/override, startup failure gating, orchestrator start path).
- R014 — Dispatch preflight validation proven (skip dispatch, continue reconciliation; startup invalid config fails fast).
- R015 — Aggregate token/rate-limit accounting into snapshot proven (completing S05’s partial validation).

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- R009 remains active because dual output-mode proof (JSON + human-readable toggle) is not yet covered by an explicit conformance test.
- S07/S08 are still pending, so there is no HTTP dashboard/API exposure or SSH remote worker dispatch yet.

## Follow-ups

- S07 should consume `OrchestratorSnapshot` directly and preserve retry/token diagnostics verbatim in API payloads.
- Add an explicit R009 conformance check for output-format selection during S09 sweep.

## Files Created/Modified

- `src/orchestrator.rs` — runtime authority loop, dispatch/retry/stall logic, snapshot surfaces
- `src/main.rs` — staged CLI bootstrap, startup validation, runtime launch/shutdown wiring
- `tests/orchestrator_tests.rs` — deterministic conformance tests for orchestrator control-plane behavior
- `tests/cli_tests.rs` — deterministic bootstrap and startup-failure semantics tests
- `.kata/REQUIREMENTS.md` — requirement status/proof updates after S06 verification
- `.kata/milestones/M001/slices/S06/S06-SUMMARY.md` — slice compression artifact

## Forward Intelligence

### What the next slice should know
- `OrchestratorSnapshot` is now stable enough to serve as the source of truth for S07 JSON/API rendering; avoid duplicating state projections in the HTTP layer.

### What's fragile
- Startup/runtime logging currently initializes JSON formatting only; if S07/S09 introduce format toggles, ensure they stay backward-compatible with current structured fields.

### Authoritative diagnostics
- `tests/orchestrator_tests.rs` is the highest-signal regression guard for control-plane behavior; failures map directly to scheduler phases and retry semantics.

### What assumptions changed
- Assumption: S05 token accounting completion would be enough for R015.
- Reality: S06 aggregate accumulation + snapshot exposure were required to fully satisfy the requirement.
