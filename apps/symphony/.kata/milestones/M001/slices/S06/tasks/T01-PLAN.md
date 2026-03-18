---
estimated_steps: 5
estimated_files: 5
---

# T01: Author failing orchestrator + CLI conformance tests

**Slice:** S06 — Orchestrator Core
**Milestone:** M001

## Description

Establish the S06 executable contract first by adding failing integration tests for orchestrator runtime behavior and CLI startup semantics. These tests must compile against minimal stubs and fail on behavioral assertions, creating a clear red baseline for T02–T04.

## Steps

1. Create `tests/orchestrator_tests.rs` with deterministic fakes for tracker responses, workflow config snapshots, and worker outcomes; encode call history so ordering assertions are possible.
2. Add test cases for startup terminal cleanup, reconcile-before-validate-before-dispatch ordering, preflight-validation skip behavior, candidate sorting/concurrency/blocker gating, retry scheduling rules, stale retry suppression, stall detection, and token/rate-limit accumulation.
3. Create `tests/cli_tests.rs` for CLI parse and bootstrap semantics: default workflow path, positional override, missing workflow failure, startup validation failure, and successful orchestrator start invocation.
4. Add minimal `src/orchestrator.rs` and bootstrap placeholders in `src/main.rs` (plus `src/lib.rs` export) so tests compile, but keep runtime behavior intentionally incomplete.
5. Run the two test files and confirm failures are assertion-level (expected red state), not compile/runtime panics from missing symbols.

## Must-Haves

- [ ] `tests/orchestrator_tests.rs` exists with concrete assertions for all S06 Must-Haves and R006/R014 coverage
- [ ] `tests/cli_tests.rs` exists with concrete assertions for R008 startup/exit semantics
- [ ] Tests include at least one diagnostic/failure-path assertion (stale retry token ignored OR preflight validation skip signal)
- [ ] `src/orchestrator.rs` and CLI bootstrap symbols compile so test suite runs
- [ ] Red baseline is intentional and documented by failing assertions tied to unimplemented behavior

## Verification

- `cargo test --test orchestrator_tests --test cli_tests`
- Confirm failures are expected behavioral gaps (not unresolved imports or syntax errors)

## Observability Impact

- Signals added/changed: Test harness captures ordered runtime events (`reconcile`, `validate`, `dispatch`, `retry_scheduled`, `retry_ignored_stale`, `worker_stalled`) for deterministic inspection.
- How a future agent inspects this: Run `cargo test --test orchestrator_tests -- --nocapture` to view the event trace from fakes.
- Failure state exposed: Each failing assertion reports the exact missing orchestrator contract segment (ordering, retry math, stall handling, CLI exit semantics).

## Inputs

- `.kata/milestones/M001/slices/S06/S06-RESEARCH.md` — required behaviors and Elixir parity traps
- `.kata/milestones/M001/slices/S06/S06-PLAN.md` — slice-level Must-Haves and requirement mapping
- `src/domain.rs` — current runtime state/snapshot structs to assert against
- `src/main.rs` — current CLI skeleton to replace with testable bootstrap path

## Expected Output

- `tests/orchestrator_tests.rs` — failing red-suite contract tests for orchestrator behavior
- `tests/cli_tests.rs` — failing red-suite contract tests for CLI behavior
- `src/orchestrator.rs` — minimal compilable orchestrator surface for upcoming implementation
- `src/main.rs` — minimal testable bootstrap scaffold replacing println-only main
- `src/lib.rs` — `pub mod orchestrator` export
