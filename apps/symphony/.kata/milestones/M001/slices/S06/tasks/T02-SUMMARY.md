---
id: T02
parent: S06
milestone: M001
provides:
  - Implemented reconcile → validate → dispatch tick sequencing with dispatch preflight skip semantics and deterministic startup terminal cleanup state updates
  - Added candidate eligibility, sorting, blocker gating, pre-dispatch refresh checks, and global/per-state slot enforcement in orchestrator dispatch selection
  - Added structured dispatch-phase diagnostics (`reason=preflight_invalid|slot_full|blocked`) and expanded orchestrator dispatch conformance coverage with per-state cap tests
key_files:
  - src/orchestrator.rs
  - tests/orchestrator_tests.rs
  - .kata/milestones/M001/slices/S06/S06-PLAN.md
  - .kata/DECISIONS.md
key_decisions:
  - "D036: Keep a normalized running_issue_states cache in orchestrator authority state for per-state slot accounting without widening RunAttempt yet"
patterns_established:
  - "Tick pipeline pattern: reconcile first, then preflight validation gate, then dispatch candidate fetch/refresh/sort/slot checks"
observability_surfaces:
  - "Structured tracing phase logs (`phase=reconcile|validate|dispatch`) plus dispatch-skip reason logs (`reason=preflight_invalid|slot_full|blocked`)"
  - "RuntimeEvent sequence (`Reconcile`, `Validate`, `Dispatch`, `ValidationSkippedDispatch`) and FakePort call history assertions in tests/orchestrator_tests.rs"
duration: 75m
verification_result: passed
completed_at: 2026-03-18T11:42:00-07:00
blocker_discovered: false
---

# T02: Implement orchestrator authority loop, reconciliation, and dispatch gating

**Implemented the orchestrator scheduler spine so each tick reconciles first, validates preflight each cycle, and only dispatches refreshed eligible issues through global + per-state concurrency gates.**

## What Happened

Implemented the T02 control-plane behavior in `src/orchestrator.rs`:

- Replaced placeholder tick order with the required reconcile-first pipeline:
  1) reconcile running IDs via tracker, 2) validate effective config + port preflight, 3) fetch/sort/filter/refresh candidates, 4) dispatch while slots remain.
- Implemented startup terminal cleanup state effects: terminal issues fetched at startup are now marked completed and removed from running/claimed/retry maps.
- Added deterministic candidate filtering:
  - required fields present (`id`, `identifier`, `title`, `state`)
  - active-state membership and terminal-state exclusion
  - not already running/claimed/completed
  - Todo blocker gate rejects non-terminal blockers
  - assigned-to-worker must remain true
- Implemented dispatch ordering and slot controls:
  - sort by priority (1..4 first), then oldest `created_at`, then identifier
  - enforce global concurrency limit from orchestrator state
  - enforce per-state concurrency via normalized state keys and configured `max_concurrent_agents_by_state`
- Added pre-dispatch issue refresh by ID; stale/missing/non-active refresh outcomes are rejected before launch.
- Added structured `tracing` logs for tick phases and dispatch skip reasons required by the task observability scope.

Test harness updates in `tests/orchestrator_tests.rs`:

- Updated FakePort refresh fallback so non-explicit refreshes return the candidate issue by ID.
- Updated ordering assertion to include pre-dispatch refresh call.
- Renamed key tests to align with task verification filters (`test_reconcile*`, `test_dispatch*`).
- Added `test_dispatch_enforces_per_state_concurrency_caps` to lock per-state slot behavior.

## Verification

Task-level verification commands (from T02 plan):

- `cargo test --test orchestrator_tests test_reconcile -- --nocapture` ✅ PASS (2/2)
- `cargo test --test orchestrator_tests test_preflight -- --nocapture` ✅ PASS (1/1)
- `cargo test --test orchestrator_tests test_dispatch -- --nocapture` ✅ PASS (3/3)

Additional slice-level checks:

- `cargo test --test orchestrator_tests -- --nocapture` ⚠️ PARTIAL (8 passed, 4 failed)
  - Remaining failures are T03-owned behavior: retry backoff math, stale retry token suppression, stall retry scheduling, codex totals/rate-limit accumulation.
- `cargo test --test orchestrator_tests --test cli_tests` ⚠️ PARTIAL (cli_tests 2 failing, orchestrator tests not fully green yet)
  - Remaining failures are T04-owned CLI bootstrap wiring (`startup_validate` + `start_orchestrator` not called yet).
- `cargo build` ✅ PASS

## Diagnostics

How to inspect T02 behavior quickly:

- Run `cargo test --test orchestrator_tests test_reconcile -- --nocapture` to verify reconcile-first ordering and startup terminal cleanup.
- Run `cargo test --test orchestrator_tests test_preflight -- --nocapture` to verify per-tick preflight invalidation skips dispatch.
- Run `cargo test --test orchestrator_tests test_dispatch -- --nocapture` to verify candidate ordering, blocker gating, refresh rejection, and per-state caps.
- Inspect `orchestrator.events()` for ordered phase/runtime events (`Reconcile`, `Validate`, `Dispatch`, `ValidationSkippedDispatch`).
- Inspect FakePort call history in tests for exact dispatch pipeline ordering including `refresh_issue:<id>`.

## Deviations

- Added one extra conformance test (`test_dispatch_enforces_per_state_concurrency_caps`) to explicitly lock per-state slot semantics (the original T01 baseline had global-cap coverage but not explicit per-state dispatch competition).

## Known Issues

- T03 behavior intentionally remains incomplete in `src/orchestrator.rs`:
  - failure retry still uses continuation delay placeholder
  - stale retry token suppression not implemented
  - stall detection/forced retry not implemented
  - codex totals/rate-limit accumulation not implemented
- T04 CLI bootstrap wiring remains incomplete (`execute_cli` still only checks workflow existence).

## Files Created/Modified

- `src/orchestrator.rs` — implemented reconcile/validate/dispatch authority loop, candidate sorting/gating, pre-dispatch refresh, slot caps, and phase/reason diagnostics
- `tests/orchestrator_tests.rs` — updated dispatch harness ordering/refresh assumptions, renamed verification-filter tests, and added per-state concurrency dispatch test
- `.kata/milestones/M001/slices/S06/S06-PLAN.md` — marked T02 complete
- `.kata/DECISIONS.md` — appended D036 (running issue state cache for per-state slot accounting)
