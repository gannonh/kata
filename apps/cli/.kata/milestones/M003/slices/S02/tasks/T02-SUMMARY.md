---
id: T02
parent: S02
milestone: M003
provides:
  - pr-review-utils.ts with 4 named exports — fetchPRContext, scopeReviewers, buildReviewerTaskPrompt, aggregateFindings
key_files:
  - src/resources/extensions/pr-lifecycle/pr-review-utils.ts
key_decisions:
  - none
patterns_established:
  - scopeReviewers, buildReviewerTaskPrompt accept object params (not positional args) — matches test contract; aggregateFindings accepts string[] not {reviewer,output}[]
observability_surfaces:
  - fetchPRContext returns null (not throws) on any gh/git failure — callers (T04 kata_review_pr) map null to { ok:false, phase:'not-in-pr' }
duration: ~20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Implement `pr-review-utils.ts`

**Created `pr-review-utils.ts` with 4 named exports; all 8 T01 tests now pass and TypeScript is clean.**

## What Happened

Read `pr-review.test.ts` (T01 output) before coding to determine the actual calling conventions. The tests reveal three divergences from the task plan's prose description:

1. `scopeReviewers` takes `{ diff, changedFiles }` (object), not two positional args.
2. `buildReviewerTaskPrompt` takes `{ reviewer, prTitle, prNumber, diff, changedFiles, prBody?, reviewerInstructions? }` (object), not `(ctx: PrContext, reviewerName, instructions)`.
3. `aggregateFindings` takes `string[]` (raw reviewer output strings), not `{ reviewer, output }[]`.

Implemented all four exports to match the test contract exactly. `fetchPRContext` follows the task plan description verbatim (not exercised in T01 tests — covered by T04 integration).

The `aggregateFindings` parser scans lines for severity markers (`critical:`, `important:`, emoji-prefixed `##` headings, `**...**` keywords), buffers lines until the next marker or end-of-finding, deduplicates by `**file:line**` fingerprint using a `Set<string>`, and falls back to `## Raw Findings` when no structured content is found.

## Verification

```
# All 8 new tests pass
npm test 2>&1 | grep -E "scopeReviewers|buildReviewer|aggregateFindings"
# → ✔ scopeReviewers always includes pr-code-reviewer
# → ✔ scopeReviewers includes pr-failure-finder when diff contains try {
# → ✔ scopeReviewers includes pr-test-analyzer when changedFiles contains a test file
# → ✔ scopeReviewers excludes pr-code-simplifier for a short diff (< 30 lines)
# → ✔ scopeReviewers includes pr-code-simplifier for a large diff (> 100 lines)
# → ✔ buildReviewerTaskPrompt returns a non-empty string containing the PR title
# → ✔ aggregateFindings includes Critical and Important headings from fixture outputs
# → ✔ aggregateFindings deduplicates repeated file references

# TypeScript clean
npx tsc --noEmit
# → (no output, exit 0)

# Exports visible
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  -e "import('./src/resources/extensions/pr-lifecycle/pr-review-utils.ts').then(m => console.log(Object.keys(m)))"
# → [ 'aggregateFindings', 'buildReviewerTaskPrompt', 'fetchPRContext', 'scopeReviewers' ]
```

100 pass / 1 fail (pre-existing `kata launches and loads extensions without errors` — unrelated to this task).

## Diagnostics

- `fetchPRContext(cwd)` returns null → diagnosis: not on a PR branch, `gh` not installed/authenticated, or no open PR. T04 tool maps this to `{ ok: false, phase: 'not-in-pr' }`.
- `scopeReviewers` is pure — call with any fixture diff string to debug scoping logic.
- `aggregateFindings` is pure — call with fixture strings to verify parsing/deduplication.

## Deviations

Three parameter-shape deviations from the task plan prose (tests are authoritative per execution instructions):

| Plan prose | Actual implementation (matches tests) |
|---|---|
| `scopeReviewers(diff: string, changedFiles: string[])` | `scopeReviewers({ diff, changedFiles })` |
| `buildReviewerTaskPrompt(ctx: PrContext, reviewerName: string, reviewerInstructions: string)` | `buildReviewerTaskPrompt({ reviewer, prTitle, prNumber, diff, changedFiles, prBody?, reviewerInstructions? })` |
| `aggregateFindings(outputs: { reviewer: string; output: string }[])` | `aggregateFindings(findings: string[])` |

T04 must use these same signatures when calling into `pr-review-utils.ts`.

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/pr-review-utils.ts` — new; 4 named exports; all 8 T01 tests now pass
