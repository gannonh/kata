---
id: T01
parent: S09
milestone: M001
provides:
  - test_by_state_concurrency_normalization in workflow_config_tests.rs
  - test_reconcile_non_active_state_stops_run_without_cleanup in orchestrator_tests.rs
  - Zero-value filtering added to max_concurrent_agents_by_state in config.rs (spec §17.1)
key_files:
  - tests/workflow_config_tests.rs
  - tests/orchestrator_tests.rs
  - src/config.rs
key_decisions:
  - "Added .filter(|(_, v)| *v > 0) to by_state normalization in config.rs to align with spec §17.1 'ignores invalid values'. The u32 type already rejects negatives at parse time; zero required explicit filtering."
patterns_established:
  - "Reconcile non-terminal stop = release_issue (removed from running, NOT added to completed). Terminal stop = mark_issue_terminal (removed from running AND added to completed)."
observability_surfaces:
  - "cargo test --test workflow_config_tests -- --nocapture"
  - "cargo test --test orchestrator_tests -- --nocapture"
duration: 15min
verification_result: passed
completed_at: 2026-03-19T00:00:00Z
blocker_discovered: false
---

# T01: Add conformance test gap closure

**Closed two spec §17.1 test gaps: key-normalization + zero-value filtering for `max_concurrent_agents_by_state`, and no-cleanup semantics for non-active non-terminal reconcile stops; full suite now 211 tests (zero failures).**

## What Happened

Two spec §17 behavioral paths had no isolated regression guard:

1. **by_state normalization**: `config.rs` was lowercasing keys but not filtering zero values. The Elixir reference's `validate_state_limits` rejects zero/negative values (spec §17.1: "ignores invalid values"). Added `.filter(|(_, v)| *v > 0)` before the `.map(lowercase)` step to align. The `u32` deserialization type already handles negatives at parse time. Added `test_by_state_concurrency_normalization` asserting: uppercase key (`InProgress`) normalized to `inprogress`, zero entry (`Review: 0`) filtered, valid entry (`in_review: 3`) preserved.

2. **Non-active non-terminal reconcile stop**: The reconcile loop calls `release_issue` (not `mark_issue_terminal`) when an issue's tracker state is non-active and non-terminal. `release_issue` removes the issue from `running` but does NOT add it to `completed`. Added `test_reconcile_non_active_state_stops_run_without_cleanup` which seeds `running` manually, provides an issue in state "In Review" (not in active_states, not in terminal_states) via `reconciled_issues`, runs one tick, and asserts both: the issue is removed from `running` AND is absent from `completed`.

## Verification

- `cargo test --test workflow_config_tests test_by_state_concurrency_normalization -- --nocapture` → ok
- `cargo test --test orchestrator_tests test_reconcile_non_active_state_stops_run_without_cleanup -- --nocapture` → ok
- `cargo test` → 211 passed, 0 failed (across all test suites)

## Diagnostics

- Inspect key normalization: `cargo test --test workflow_config_tests -- --nocapture`
- Inspect reconcile semantics: `cargo test --test orchestrator_tests -- --nocapture`

## Deviations

One deviation from the task plan: the plan described testing a "negative-value entry (`Todo: -1`)" in the YAML. This is impossible — the deserialization type is `HashMap<String, u32>` which rejects negative YAML integers at parse time (serde returns an error for the whole config, not just that entry). The test instead uses a zero-value entry (`Review: 0`) as the "invalid" case, which required adding the explicit filter to config.rs.

## Known Issues

None.

## Files Created/Modified

- `src/config.rs` — Added `.filter(|(_, v)| *v > 0)` to zero-value filtering in by_state normalization
- `tests/workflow_config_tests.rs` — Added `test_by_state_concurrency_normalization`
- `tests/orchestrator_tests.rs` — Added `test_reconcile_non_active_state_stops_run_without_cleanup`
