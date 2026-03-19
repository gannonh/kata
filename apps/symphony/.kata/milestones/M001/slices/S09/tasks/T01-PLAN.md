---
estimated_steps: 5
estimated_files: 2
---

# T01: Add conformance test gap closure

**Slice:** S09 — Conformance Sweep and Integration Polish
**Milestone:** M001

## Description

Two spec §17 behavioral paths are implemented but have no isolated test:

1. `max_concurrent_agents_by_state` key normalization — `src/config.rs:395-425` lowercases keys and filters invalid (zero/negative) values. Spec §17.1 bullet "Per-state concurrency map normalizes + ignores invalid" has no test.
2. Non-active state reconcile stop-without-cleanup — `src/orchestrator.rs` reconcile loop removes running entries whose tracker state is non-active but non-terminal (e.g. `InProgress` → `Done` → terminal is workspace-cleanup; `Active` → `Inactive` → no cleanup). The no-cleanup semantic has no isolated test.

Both behaviors are correct at runtime (proven by the reconciliation pipeline tests implicitly) but lack an explicit regression guard. These are the only gaps between the current 159-test baseline and full §17 conformance coverage.

## Steps

1. Open `tests/workflow_config_tests.rs`. Add test `test_by_state_concurrency_normalization`:
   - Build a WORKFLOW.md string with `max_concurrent_agents_by_state` containing: an uppercase key (`InProgress: 2`), a zero-value entry (`Review: 0`), a negative-value entry (`Todo: -1`), and a valid lowercase entry (`in_review: 3`).
   - Parse via `parse_workflow` → `ServiceConfig::from_workflow`.
   - Assert: `InProgress` key appears as `inprogress` (or normalized lowercase form matching the implementation), `Review` and `Todo` entries are absent (filtered), and `in_review: 3` survives.
   - Consult `src/config.rs:395-425` first to understand exact normalization logic (what "invalid" means — is it 0, negative, or non-positive?).

2. Open `tests/orchestrator_tests.rs`. Add test `test_reconcile_non_active_state_stops_run_without_cleanup`:
   - Set up a fake tracker that returns a non-active, non-terminal state for one running issue (e.g. use whatever state variant the orchestrator treats as "inactive" — consult `src/orchestrator.rs` reconcile branch).
   - Add a running entry for that issue in `orchestrator.state.running`.
   - Run one reconcile tick via the test harness pattern already established in that file.
   - Assert: the running entry is removed from `orchestrator.state.running`.
   - Assert: workspace cleanup was NOT called (check the fake workspace manager's cleanup call count).

3. Run `cargo test --test workflow_config_tests test_by_state_concurrency_normalization` — confirm green.

4. Run `cargo test --test orchestrator_tests test_reconcile_non_active_state_stops_run_without_cleanup` — confirm green.

5. Run `cargo test` — confirm full suite passes (≥161 tests, zero failures).

## Must-Haves

- [ ] `test_by_state_concurrency_normalization` exists in `tests/workflow_config_tests.rs` and passes
- [ ] Test asserts lowercase key normalization of `max_concurrent_agents_by_state` entries
- [ ] Test asserts zero/invalid value entries are filtered out
- [ ] `test_reconcile_non_active_state_stops_run_without_cleanup` exists in `tests/orchestrator_tests.rs` and passes
- [ ] Test asserts the running entry is removed when tracker returns non-active state
- [ ] Test asserts workspace cleanup is NOT called for non-terminal state stop
- [ ] `cargo test` exits 0 with ≥161 tests passing

## Verification

- `cargo test --test workflow_config_tests test_by_state_concurrency_normalization -- --nocapture` → "ok"
- `cargo test --test orchestrator_tests test_reconcile_non_active_state_stops_run_without_cleanup -- --nocapture` → "ok"
- `cargo test` → all tests pass, zero failures

## Observability Impact

- Signals added/changed: None (tests only; no runtime code changes)
- How a future agent inspects this: `cargo test --test workflow_config_tests -- --nocapture` and `cargo test --test orchestrator_tests -- --nocapture`
- Failure state exposed: descriptive `assert_eq!` / `assert!` messages inline with test output

## Inputs

- `src/config.rs` lines 395-425 — by_state normalization implementation to understand what "invalid" means
- `src/orchestrator.rs` reconcile loop — `Inactive` vs `Terminal` branch to understand no-cleanup vs cleanup semantics
- `tests/orchestrator_tests.rs` — existing test harness patterns (fake tracker, fake workspace, tick invocation)
- `tests/workflow_config_tests.rs` — existing parse + config test patterns

## Expected Output

- `tests/workflow_config_tests.rs` — one new test: `test_by_state_concurrency_normalization`
- `tests/orchestrator_tests.rs` — one new test: `test_reconcile_non_active_state_stops_run_without_cleanup`
- `cargo test` output: ≥161 tests, 0 failures
