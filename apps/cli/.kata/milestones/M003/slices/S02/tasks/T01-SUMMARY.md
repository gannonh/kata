---
id: T01
parent: S02
milestone: M003
provides:
  - pr-review.test.ts with 8 contract tests for scopeReviewers, buildReviewerTaskPrompt, aggregateFindings
key_files:
  - src/resources/extensions/kata/tests/pr-review.test.ts
key_decisions:
  - none
patterns_established:
  - Top-level await import at module scope triggers MODULE_NOT_FOUND until T02 ships the module — intentional TDD gate pattern (same as pr-body-composer.test.ts)
observability_surfaces:
  - none (tests only)
duration: ~10m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Write failing tests for reviewer scoping and aggregation

**Created `pr-review.test.ts` with 8 contract tests that fail with MODULE_NOT_FOUND until T02 ships `pr-review-utils.ts`.**

## What Happened

Read `pr-body-composer.test.ts` and `pr-preferences.test.mjs` to confirm the import pattern. Import path is `../../pr-lifecycle/pr-review-utils.js` (resolved to `.ts` at test time via `resolve-ts.mjs` hook).

Created `src/resources/extensions/kata/tests/pr-review.test.ts` with:
- Top-level `await import('../../pr-lifecycle/pr-review-utils.js')` that destructures `{ scopeReviewers, buildReviewerTaskPrompt, aggregateFindings }` — throws MODULE_NOT_FOUND until T02
- 5 `scopeReviewers` tests: always includes `pr-code-reviewer`, includes `pr-failure-finder` on `try {`, includes `pr-test-analyzer` on `.test.ts` files, excludes `pr-code-simplifier` on short diff (<30 lines), includes `pr-code-simplifier` on large diff (>100 lines via `'line\n'.repeat(101)`)
- 1 `buildReviewerTaskPrompt` test: returns non-empty string containing the PR title
- 2 `aggregateFindings` tests: contains Critical + Important strings from fixture outputs; deduplicates `src/foo.ts:42` to appear exactly once

## Verification

```
ls src/resources/extensions/kata/tests/pr-review.test.ts
# → file exists

npm test 2>&1 | grep -E "pr-review|Cannot find module|MODULE_NOT_FOUND"
# → ERR_MODULE_NOT_FOUND: Cannot find module '.../pr-review-utils.ts'
# → ✖ src/resources/extensions/kata/tests/pr-review.test.ts (359ms)
```

Suite aborts at the top-level import with MODULE_NOT_FOUND — not a parse error. Correct TDD gate state.

## Diagnostics

Run `npm test 2>&1 | grep pr-review` to confirm the suite is still in the expected failing state. If it shows a syntax error instead of MODULE_NOT_FOUND, the test file itself has a bug.

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/kata/tests/pr-review.test.ts` — new; 8 contract tests that fail with MODULE_NOT_FOUND until T02
