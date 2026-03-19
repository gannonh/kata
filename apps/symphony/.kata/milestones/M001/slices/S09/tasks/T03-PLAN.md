---
estimated_steps: 5
estimated_files: 2
---

# T03: Final verification, REQUIREMENTS.md update, and milestone close

**Slice:** S09 — Conformance Sweep and Integration Polish
**Milestone:** M001

## Description

Final gate task: run the full test suite and static analysis, validate R013 is fully satisfied, update `REQUIREMENTS.md` with proof, and update `STATE.md` to reflect S09 and M001 complete. No code changes — this task is pure verification and bookkeeping.

## Steps

1. Run `cargo test` — capture total test count and confirm zero failures. Record the exact count (expected ≥161).

2. Run `cargo clippy -- -D warnings` — confirm exits zero with no warnings.

3. Open `.kata/REQUIREMENTS.md`. Update R013:
   - Change `Status: active` → `Status: validated`
   - Update the `Validation` field to: `M001/S09 — cargo test passes <N> tests (all green); tests/workflow_config_tests.rs::test_by_state_concurrency_normalization covers §17.1 by_state normalization; tests/orchestrator_tests.rs::test_reconcile_non_active_state_stops_run_without_cleanup covers §17.4 non-active stop semantic; cargo clippy -- -D warnings exits zero`
   - In the Traceability table, update R013 row: Proof column with `M001/S09 cargo test (<N> tests: all spec §17 gaps closed)`
   - Update Coverage Summary: Active count decrements by 1 (R013 moves to validated); Validated count increments by 1.

4. Open `.kata/STATE.md`. Update to reflect:
   - Active Milestone: M001 — Full Spec Conformance
   - Active Slice: none (S09 complete)
   - Phase: Complete
   - Next Action: M001 milestone complete — all 9 slices done, all requirements validated.

5. Verify the updates look correct with a quick `grep` check on key fields.

## Must-Haves

- [ ] `cargo test` exits 0 with ≥161 tests (zero failures)
- [ ] `cargo clippy -- -D warnings` exits 0 (zero warnings)
- [ ] R013 status is `validated` in `REQUIREMENTS.md`
- [ ] R013 traceability row has a proof entry referencing M001/S09 and new test names
- [ ] Coverage Summary counts are consistent with the status fields above
- [ ] `STATE.md` reflects S09 complete and M001 milestone complete

## Verification

- `cargo test` exits 0; test count in output ≥161
- `cargo clippy -- -D warnings` exits 0
- `grep -A3 "R013" .kata/REQUIREMENTS.md | grep "validated"` returns a match
- `grep "Phase: Complete" .kata/STATE.md` returns a match (or equivalent done-state wording)

## Observability Impact

- Signals added/changed: None
- How a future agent inspects this: `cat .kata/STATE.md`, `cat .kata/REQUIREMENTS.md`
- Failure state exposed: None

## Inputs

- T01 completion — 2 new tests passing, total count ≥161
- T02 completion — README written
- `.kata/REQUIREMENTS.md` — current R013 entry (status: active)
- `.kata/STATE.md` — current state file

## Expected Output

- `.kata/REQUIREMENTS.md` — R013 marked validated with proof note and updated traceability row
- `.kata/STATE.md` — reflects S09/M001 complete
