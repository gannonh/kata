---
id: T01
parent: S04
milestone: M003
provides:
  - pr-merge.test.ts with 7 unit tests pinning the public contract for parseCIChecks and updateSliceInRoadmap
key_files:
  - src/resources/extensions/kata/tests/pr-merge.test.ts
key_decisions:
  - D042 (reused): test file in kata/tests/ glob; MODULE_NOT_FOUND TDD gate — same pattern as S03
patterns_established:
  - "TDD gate: top-level `await import(...)` from pr-merge.test.ts → ERR_MODULE_NOT_FOUND until T02 creates pr-merge-utils.ts"
  - "Test fixtures use JSON.stringify([...]) to build parseCIChecks input inline — no fixture files needed"
observability_surfaces:
  - none
duration: 15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Write failing tests for `pr-merge-utils.ts`

**7-test TDD gate for `parseCIChecks` and `updateSliceInRoadmap` — 105 existing tests still pass, new file fails with ERR_MODULE_NOT_FOUND as designed.**

## What Happened

Created `src/resources/extensions/kata/tests/pr-merge.test.ts` with 7 unit tests covering the two pure functions in the upcoming `pr-merge-utils.ts`. The file uses the established top-level `await import(...)` pattern as a TDD gate — before T02 creates the module, the test runner fails with ERR_MODULE_NOT_FOUND.

Tests written:
- `parseCIChecks`: 4 tests — empty array → allPassing, all-success → allPassing, one-failing conclusion → failing list, one-pending status → pending list
- `updateSliceInRoadmap`: 3 tests — flips target checkbox, leaves others untouched, no-op when already [x]

All 4 parseCIChecks tests use `JSON.stringify([...])` to build input inline (no fixture files needed).

## Verification

- `npm test` with pr-merge-utils.ts absent → ERR_MODULE_NOT_FOUND for pr-merge.test.ts; 105 other tests pass
- After T02: `npm test` shows 112/112 pass, 0 fail

## Diagnostics

- `npm test` output is the inspection surface: 105 pass + 1 fail (pr-merge.test.ts) is the expected state until T02
- After T02: `npm test` should show 112/112 pass, 0 fail

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/kata/tests/pr-merge.test.ts` — 7 unit tests for parseCIChecks (4) and updateSliceInRoadmap (3)
