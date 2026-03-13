---
estimated_steps: 3
estimated_files: 1
---

# T01: Create failing unit tests for `summarizeComments`

**Slice:** S03 — Address Review Comments
**Milestone:** M003

## Description

Create `pr-address.test.ts` in `src/resources/extensions/kata/tests/` following the exact pattern of `pr-review.test.ts`. A top-level `await import` of `../../pr-lifecycle/pr-address-utils.js` will throw `ERR_MODULE_NOT_FOUND` until T02 creates the file — this is intentional and is the TDD gate. Four tests pin the `summarizeComments` contract: empty input, resolved thread, outdated thread, and sequential numbering across mixed types.

The tests should fail (module not found) when T01 is done. They should all pass after T02.

## Steps

1. Create `src/resources/extensions/kata/tests/pr-address.test.ts`. Open with `import test from "node:test"` and `import assert from "node:assert/strict"`. Add the TDD-gate top-level await import:
   ```typescript
   const { summarizeComments } = await import("../../pr-lifecycle/pr-address-utils.js");
   ```

2. Define a `makeThread(overrides)` helper that returns a minimal valid `review_threads` node (with `id`, `isResolved`, `isOutdated`, `path`, `line`, and `comments.nodes` containing one comment with `body`, `author.login`, `createdAt`, `updatedAt`). This avoids repetition across the four tests.

3. Write the four tests:
   - `"summarizeComments returns empty result for empty input"` — pass `{ conversation_comments: [], reviews: [], review_threads: [] }` (plus a minimal `pull_request` field); assert `result.totalCount === 0`, `result.actionableCount === 0`, `result.numbered.length === 0`.
   - `"summarizeComments marks resolved thread with isResolved and excludes from actionableCount"` — one thread with `isResolved: true, isOutdated: false`; assert `result.numbered[0].isResolved === true`, `result.actionableCount === 0`.
   - `"summarizeComments marks outdated thread with isOutdated and excludes from actionableCount"` — one thread with `isResolved: false, isOutdated: true`; assert `result.numbered[0].isOutdated === true`, `result.actionableCount === 0`.
   - `"summarizeComments assigns sequential n values starting at 1 across mixed types"` — one conversation comment + one review + one unresolved non-outdated thread; assert `result.numbered[0].n === 1`, `result.numbered[1].n === 2`, `result.numbered[2].n === 3`, `result.totalCount === 3`, `result.actionableCount === 1`.

## Must-Haves

- [ ] File exists at `src/resources/extensions/kata/tests/pr-address.test.ts`
- [ ] Top-level `await import("../../pr-lifecycle/pr-address-utils.js")` is the first import (TDD gate)
- [ ] All 4 tests are present and distinct
- [ ] `makeThread(overrides)` helper avoids fixture duplication
- [ ] `npm test` reports an error or failure for the file (not silently skipped) due to MODULE_NOT_FOUND

## Verification

- `npm test 2>&1 | grep -E "pr-address|ERR_MODULE|Cannot find"` → output includes the test file name and the import error
- Confirm the file is picked up by the glob: `ls src/resources/extensions/kata/tests/pr-address.test.ts` → exists

## Observability Impact

- Signals added/changed: None (test-only file)
- How a future agent inspects this: `npm test` run; MODULE_NOT_FOUND error clearly identifies missing `pr-address-utils.ts`
- Failure state exposed: Expected — MODULE_NOT_FOUND on `pr-address-utils.js` is the TDD gate signaling T02 work remains

## Inputs

- `src/resources/extensions/kata/tests/pr-review.test.ts` — exact structural pattern to follow (top-level await import, test() calls, assert.ok/equal)
- `src/resources/extensions/pr-lifecycle/scripts/fetch_comments.py` — defines the shape of `review_threads` nodes (fields: `id`, `isResolved`, `isOutdated`, `path`, `line`, `comments.nodes`)
- S03 research `summarizeComments` contract — input/output types and actionableCount definition

## Expected Output

- `src/resources/extensions/kata/tests/pr-address.test.ts` — new test file with 4 tests; file throws MODULE_NOT_FOUND when run (expected TDD gate failure)
