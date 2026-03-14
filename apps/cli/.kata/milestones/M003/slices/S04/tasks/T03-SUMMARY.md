---
id: T03
parent: S04
milestone: M003
provides:
  - kata_merge_pr tool registered in pr-lifecycle/index.ts
  - Full 8-phase handler: gh-missing → gh-unauth → branch-parse-failed → pr-detect-failed → ci-failing/ci-pending → merge-failed → sync (best-effort) → roadmap-update + return
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
key_decisions:
  - "D046 (consumed): updateSliceInRoadmap ^ + m anchored regex works correctly for roadmap checkbox flipping"
  - "D047 (consumed): execSync throw on gh pr checks → treat as { allPassing: true } — silently allows merge when no CI configured"
patterns_established:
  - "kata_merge_pr CI guard pattern: execSync → parseCIChecks → branch on failing/pending only if !skipCICheck; execSync throw is catch-and-continue"
  - "roadmapUpdateFailed: true in success return — non-fatal state divergence signal for agent to surface as warning"
  - "syncLocalAfterMerge wrapped in try/catch at call site (belt-and-suspenders beyond the internal swallowing)"
observability_surfaces:
  - "kata_merge_pr returns { phase } enum covering 8 failure modes — agents branch on phase without prose parsing"
  - "roadmapUpdateFailed: true on success signals non-fatal roadmap state divergence"
  - "ci-failing: error carries failing check names; ci-pending: error carries pending check names"
  - "merge-failed: error carries raw gh stderr"
duration: 25m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Register `kata_merge_pr` tool in `index.ts`

**`kata_merge_pr` tool registered in `pr-lifecycle/index.ts` with full 8-phase handler — CI validation → squash merge → local cleanup → roadmap update is a single callable tool invocation. R203 delivered at contract level.**

## What Happened

Added `kata_merge_pr` tool registration to `src/resources/extensions/pr-lifecycle/index.ts`:

1. **Import added** at top of file — pulls in all 5 symbols from `./pr-merge-utils.js`:
   `parseCIChecks`, `getPRNumber`, `mergeGitHubPR`, `syncLocalAfterMerge`, `markSliceDoneInRoadmap`

2. **Tool registered** after `kata_fetch_pr_comments` with:
   - Parameters: `prNumber?: number`, `strategy?: "squash" | "merge" | "rebase"`, `skipCICheck?: boolean`, `cwd?: string`
   - Description covering CI validation, squash merge, branch deletion, roadmap.md checkbox update

3. **Handler implements 8 phases in order:**
   - (a) `isGhInstalled()` → `gh-missing` phase
   - (b) `isGhAuthenticated()` → `gh-unauth` phase
   - (c) `getCurrentBranch` + `parseBranchToSlice` → `branch-parse-failed` phase
   - (d) `getPRNumber` (or use `params.prNumber`) → `pr-detect-failed` phase
   - (e) `execSync("gh pr checks ...")` + `parseCIChecks` → `ci-failing` or `ci-pending` phase (skipped when `skipCICheck: true`; `execSync` throw silently treated as `allPassing: true` per D047)
   - (f) `mergeGitHubPR(prNumber, strategy, cwd)` → `merge-failed` phase on failure
   - (g) `syncLocalAfterMerge(branch, cwd)` — try/catch at call site (belt-and-suspenders)
   - (h) `markSliceDoneInRoadmap(milestoneId, sliceId, cwd)` → `roadmapUpdateFailed: true` in result when returns false (tool still returns `ok: true`)
   - (i) Return `{ ok: true, url, branch, milestoneId, sliceId [, roadmapUpdateFailed] }`

## Verification

- `npx tsc --noEmit` → exits 0, no errors
- `npm test` → 112 pass, 0 fail
- `grep -c "kata_merge_pr" src/resources/extensions/pr-lifecycle/index.ts` → 2
- `node ... -e "import('./src/resources/extensions/pr-lifecycle/index.ts').then(() => console.log('ok'))"` → prints `ok`
- `grep -A3 'name:.*kata_merge_pr' src/resources/extensions/pr-lifecycle/index.ts` → shows tool name + description start

## Diagnostics

- Call `kata_merge_pr` and inspect `phase` + `error` for failure state
- `grep '\- \[x\]' .kata/milestones/M003/M003-ROADMAP.md` verifies roadmap update after successful merge
- `ci-failing` phase: `error` carries comma-separated failing check names
- `ci-pending` phase: `error` carries comma-separated pending check names
- `merge-failed` phase: `error` carries raw `gh stderr`
- `roadmapUpdateFailed: true` in success result → agent should note and optionally re-run roadmap update manually

## Deviations

- T03 was executed in a single session that also delivered T01 (test file) and T02 (pr-merge-utils.ts), since those prior tasks had not yet been committed to the branch. The task plan called these out in carry-forward context but their artifacts weren't present. All three tasks' deliverables were built and verified together.

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — import for pr-merge-utils.js added; `kata_merge_pr` tool registered with 8-phase handler (~130 lines added)
- `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` — new file (T02 deliverable, created as dependency)
- `src/resources/extensions/kata/tests/pr-merge.test.ts` — new file (T01 deliverable, created as dependency)
