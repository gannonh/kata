---
id: T01
parent: S03
milestone: M003
provides:
  - pr-address.test.ts with 4 failing unit tests for summarizeComments (TDD gate)
key_files:
  - src/resources/extensions/kata/tests/pr-address.test.ts
key_decisions:
  - none (followed established pr-review.test.ts pattern exactly)
patterns_established:
  - makeThread/makeConversationComment/makeReview helpers avoid fixture duplication across 4 tests
  - top-level await import TDD gate: MODULE_NOT_FOUND until T02 creates pr-address-utils.ts
observability_surfaces:
  - none (test-only file)
duration: ~5min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Create failing unit tests for `summarizeComments`

**Created `pr-address.test.ts` with 4 unit tests for `summarizeComments`; file throws `ERR_MODULE_NOT_FOUND` as the TDD gate signaling T02 work remains.**

## What Happened

Created `src/resources/extensions/kata/tests/pr-address.test.ts` following the exact structural pattern of `pr-review.test.ts`. The file opens with `import test from "node:test"` and `import assert from "node:assert/strict"`, followed immediately by the TDD-gate top-level `await import("../../pr-lifecycle/pr-address-utils.js")` that fails until T02 creates the implementation.

Three minimal fixture helpers (`makeThread`, `makeConversationComment`, `makeReview`) avoid repetition across the four tests. All four tests are present and distinct:
1. Empty input → `totalCount === 0`, `actionableCount === 0`, `numbered.length === 0`
2. Resolved thread → `numbered[0].isResolved === true`, `actionableCount === 0`
3. Outdated thread → `numbered[0].isOutdated === true`, `actionableCount === 0`
4. Mixed types → sequential `n` (1, 2, 3), `totalCount === 3`, `actionableCount === 1`

## Verification

```
ls src/resources/extensions/kata/tests/pr-address.test.ts
→ file exists

npm test 2>&1 | grep -E "pr-address|ERR_MODULE|Cannot find"
→ Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...pr-address-utils.ts'
→ ✖ src/resources/extensions/kata/tests/pr-address.test.ts (579ms)
```

Both verification checks from the task plan pass. The test file is picked up by the glob, throws the expected `ERR_MODULE_NOT_FOUND`, and is clearly reported as a failure (not silently skipped).

## Diagnostics

`npm test` output clearly identifies `pr-address-utils.ts` as the missing module — a future agent running T02 can confirm the gate by running `npm test 2>&1 | grep pr-address` and verifying the error disappears after creating the implementation.

## Deviations

None. Followed the task plan and `pr-review.test.ts` pattern exactly.

## Known Issues

None. Expected failure (MODULE_NOT_FOUND) is intentional.

## Files Created/Modified

- `src/resources/extensions/kata/tests/pr-address.test.ts` — new test file with 4 unit tests for `summarizeComments`; fails with `ERR_MODULE_NOT_FOUND` until T02
