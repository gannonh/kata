---
id: T01
parent: S06
milestone: M001
provides:
  - Added red-baseline conformance integration suites for orchestrator runtime (R006/R014) and CLI bootstrap semantics (R008)
  - Added deterministic orchestrator test harness with call-history/event assertions for ordering, retry, stall, and diagnostics paths
  - Added minimal compilable orchestrator placeholder surface (`Orchestrator::new`, `run`, tick/retry/snapshot APIs) for T02/T03 implementation
  - Added testable CLI bootstrap seam (`parse_cli_from`, `execute_cli`, `BootstrapDeps`) for T04 implementation
key_files:
  - tests/orchestrator_tests.rs
  - tests/cli_tests.rs
  - src/orchestrator.rs
  - src/main.rs
  - src/lib.rs
key_decisions:
  - Keep T01 runtime intentionally incomplete so failures are assertion-level contract gaps, not missing-symbol compile errors
  - Use deterministic fake port/deps objects that capture ordered calls and observable runtime events for future debugging
patterns_established:
  - Contract-first red suite: executable behavior spec lands before orchestrator implementation
  - Bootstrap dependency injection seam in binary for deterministic CLI tests without process-level exit trapping
observability_surfaces:
  - `tests/orchestrator_tests.rs` fake call history (`reconcile_running_issues`, `validate_dispatch_preflight`, `fetch_candidate_issues`)
  - Runtime event assertions (`retry_scheduled`, `retry_ignored_stale`, `worker_stalled`, validation skip signal)
  - `cargo test --test orchestrator_tests -- --nocapture`
duration: 85m
verification_result: passed
completed_at: 2026-03-18T18:42:00Z
blocker_discovered: false
---

# T01: Author failing orchestrator + CLI conformance tests

**Authored failing conformance suites plus minimal orchestrator/CLI scaffolds that compile and fail on expected behavioral assertions.**

## What Happened

Implemented the two required S06 red-baseline test files and scaffolded the minimum runtime surfaces needed for compilation.

- Added `tests/orchestrator_tests.rs` with deterministic fake tracker/orchestrator port behavior and explicit assertions for startup cleanup, tick ordering, preflight-skip dispatch behavior, candidate ordering/gating, stale refresh rejection, retry math, stale retry suppression, stall detection, token/rate-limit accumulation, and snapshot diagnostics.
- Added `tests/cli_tests.rs` for CLI parse/bootstrap semantics: default workflow path, positional override, missing workflow failure, startup validation failure behavior, and successful startup invocation path.
- Added `src/orchestrator.rs` placeholder module exporting `Orchestrator::new(...)`, `run()`, and supporting APIs used by tests.
- Replaced `src/main.rs` println skeleton with testable bootstrap helpers (`parse_cli_from`, `execute_cli`, `BootstrapDeps`) while intentionally leaving runtime behavior incomplete.
- Exported orchestrator module from `src/lib.rs` so integration tests compile.

The red baseline is intentional: tests now fail on behavioral contract assertions that T02–T04 will implement.

## Verification

Commands run:

- `cargo test --test orchestrator_tests --test cli_tests`
  - Result: **fails at assertion level (expected red baseline)**
  - CLI failures (2): startup validation path not yet wired; startup invocation path not yet wired
  - Orchestrator failures (9): ordering, startup cleanup state, validation skip gating, candidate sorting/blockers, refresh/stale-state rejection, retry backoff, stale retry suppression, stall detection, token/rate-limit accumulation
  - No unresolved imports/syntax errors in final run
- `cargo test --test orchestrator_tests`
  - Result: assertion-level failures only (expected)
- `cargo build`
  - Result: **pass**

Must-have coverage status:

- [x] `tests/orchestrator_tests.rs` exists with concrete S06/R006/R014 assertions
- [x] `tests/cli_tests.rs` exists with concrete R008 startup/exit assertions
- [x] Includes diagnostic failure-path assertions (`ValidationSkippedDispatch`, `RetryIgnoredStale`)
- [x] `src/orchestrator.rs` and CLI bootstrap symbols compile so suite runs
- [x] Red baseline documented as intentional behavioral gaps

## Diagnostics

How to inspect contract gaps quickly:

- `cargo test --test orchestrator_tests -- --nocapture` for orchestrator contract failures and event-path assertions
- `cargo test --test cli_tests -- --nocapture` for bootstrap/exit semantic failures
- Use failing assertion messages as implementation checklist for T02–T04 (ordering, retry math, stale-token handling, stall logic, startup validation wiring)

## Deviations

None.

## Known Issues

- `src/orchestrator.rs` is intentionally incomplete; current behavior does not satisfy S06 runtime contracts yet.
- `execute_cli` currently checks workflow existence only; startup validation and orchestrator start are intentionally not invoked yet.

## Files Created/Modified

- `tests/orchestrator_tests.rs` — new orchestrator conformance suite with deterministic fakes and red assertions
- `tests/cli_tests.rs` — new CLI conformance suite for parse/bootstrap semantics
- `src/orchestrator.rs` — minimal orchestrator surface/stub used by tests
- `src/main.rs` — testable CLI bootstrap scaffold replacing placeholder startup print
- `src/lib.rs` — exports `orchestrator` module
- `.kata/milestones/M001/slices/S06/S06-PLAN.md` — marked T01 complete
