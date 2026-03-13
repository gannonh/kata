---
estimated_steps: 3
estimated_files: 1
---

# T01: Write failing tests for reviewer scoping and aggregation

**Slice:** S02 — Bundled Reviewer Subagents & Parallel Dispatch
**Milestone:** M003

## Description

Create `pr-review.test.ts` in the existing kata test directory. The file imports from `../../pr-lifecycle/pr-review-utils.js` (which does not exist yet), so the entire suite fails with `MODULE_NOT_FOUND` until T02 ships the implementation. Eight named tests establish the API contract for `scopeReviewers`, `buildReviewerTaskPrompt`, and `aggregateFindings`.

This is the TDD gate for S02. The tests are intentionally failing — that is the correct state after T01.

## Steps

1. Read the existing test files (`pr-body-composer.test.ts`, `pr-preferences.test.mjs`) to confirm the import path pattern from `kata/tests/` to `pr-lifecycle/` modules. Correct path is `../../pr-lifecycle/<module>.js` — do NOT use `../../extensions/pr-lifecycle/`.

2. Create `src/resources/extensions/kata/tests/pr-review.test.ts` with:
   - A top-level `await import('../../pr-lifecycle/pr-review-utils.js')` that destructures `{ scopeReviewers, buildReviewerTaskPrompt, aggregateFindings }` — this line throws `MODULE_NOT_FOUND` until T02
   - Eight `test(...)` calls using Node.js built-in `test` and `assert/strict`:
     - Test 1: `scopeReviewers` always includes `'pr-code-reviewer'` (pass a minimal diff string)
     - Test 2: `scopeReviewers` includes `'pr-failure-finder'` when diff contains `try {`
     - Test 3: `scopeReviewers` includes `'pr-test-analyzer'` when changedFiles contains `'src/foo.test.ts'`
     - Test 4: `scopeReviewers` excludes `'pr-code-simplifier'` when diff is a short string (< 30 lines)
     - Test 5: `scopeReviewers` includes `'pr-code-simplifier'` when diff is a large string (> 100 lines — use `'line\n'.repeat(101)`)
     - Test 6: `buildReviewerTaskPrompt` returns a non-empty string that includes the PR title
     - Test 7: `aggregateFindings` with two fixture outputs (one containing "Critical: **src/foo.ts:42**", one containing "Important: **src/bar.ts:10**") returns a string containing `"Critical"` and `"Important"`
     - Test 8: `aggregateFindings` deduplicates — two inputs both mentioning `**src/foo.ts:42**` produce a result where `"src/foo.ts:42"` appears exactly once

3. Verify the file exists and the test runner sees it (but fails):
   ```
   npm test 2>&1 | grep -A 3 "pr-review"
   ```
   Expected: suite starts, then fails with MODULE_NOT_FOUND error. A syntax error would indicate a mistake in T01 itself — fix it before finishing.

## Must-Haves

- [ ] `src/resources/extensions/kata/tests/pr-review.test.ts` exists
- [ ] Import path is `../../pr-lifecycle/pr-review-utils.js` (not `../../extensions/pr-lifecycle/...`)
- [ ] 8 named tests cover `scopeReviewers` (5 tests), `buildReviewerTaskPrompt` (1 test), `aggregateFindings` (2 tests)
- [ ] Running `npm test` shows the suite failing with MODULE_NOT_FOUND — not a parse error

## Verification

```bash
# File exists
ls src/resources/extensions/kata/tests/pr-review.test.ts

# Suite runs but fails with MODULE_NOT_FOUND (not a syntax error)
npm test 2>&1 | grep -E "pr-review|Cannot find module|MODULE_NOT_FOUND"
```

## Observability Impact

- Signals added/changed: None — this task creates tests only
- How a future agent inspects this: `npm test` output shows which tests pass/fail; test names serve as a contract specification for T02
- Failure state exposed: If this task produces a parse error instead of MODULE_NOT_FOUND, the test file itself has a bug — fix the syntax before proceeding to T02

## Inputs

- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` — reference for import path pattern (`../../pr-lifecycle/...`) and Node.js test/assert usage
- `src/resources/extensions/kata/tests/resolve-ts.mjs` — explains why `.js` import specifiers resolve to `.ts` source files at test time
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` — reference for how test fixtures are constructed inline

## Expected Output

- `src/resources/extensions/kata/tests/pr-review.test.ts` — 8 failing tests; suite aborts at the top-level import with MODULE_NOT_FOUND until T02 ships `pr-review-utils.ts`
