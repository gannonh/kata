---
id: T02
parent: S04
milestone: M003
provides:
  - pr-merge-utils.ts — 9 exported symbols covering the full merge workflow
  - parseCIChecks(rawJson): CICheckResult — pure fn; empty=allPassing, failure conclusion→failing[], non-completed status→pending[]
key_files:
  - src/resources/extensions/pr-lifecycle/pr-merge-utils.ts
key_decisions:
  - "D046 (confirmed): updateSliceInRoadmap uses ^ + m anchored regex — no formatRoadmap counterpart exists in paths.ts/files.ts"
  - "D047 (confirmed): parseCIChecks invalid JSON → { allPassing: false } fail-closed; execSync throw in tool handler → silently allow merge"
patterns_established:
  - "parseCIChecks: FAILING_CONCLUSIONS as a Set for O(1) lookup; pending = status !== 'completed'; idiomatic for the CI check pattern"
  - "syncLocalAfterMerge: detect main via symbolic-ref, fall back to 'main' — mirrors worktree.ts getMainBranch pattern"
observability_surfaces:
  - "`mergeGitHubPR` failure shape: `{ ok: false, phase: 'merge-failed', error: '<gh stderr>' }`"
  - "`markSliceDoneInRoadmap` failure shape: returns `false` (boolean) — never throws"
duration: 30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Implement `pr-merge-utils.ts`

**256-line module with 9 exports wiring CI status parsing, roadmap checkbox updates, GitHub PR merge, and best-effort local branch cleanup — 112/112 tests pass, TypeScript clean.**

## What Happened

Created `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` with all 9 exported symbols needed by `kata_merge_pr` in T03.

Exports:
- `CICheckResult` interface — `{ allPassing: boolean; failing: string[]; pending: string[] }`
- `MergeResult` type — discriminated union `{ ok: true; url: string } | { ok: false; phase: string; error: string }`
- `parseCIChecks(rawJson: string): CICheckResult` — pure function using `FAILING_CONCLUSIONS` Set for O(1) lookup; invalid JSON returns `{ allPassing: false }` fail-closed per D047
- `getPRNumber(cwd: string): number | null` — wraps `gh pr view --json number`
- `mergeGitHubPR(prNumber, strategy, cwd): Promise<MergeResult>` — fetches URL before merge, then calls `gh pr merge --squash/merge/rebase --delete-branch`
- `syncLocalAfterMerge(branch, cwd): void` — best-effort; detects default branch via `git symbolic-ref refs/remotes/origin/HEAD`, falls back to "main"
- `updateSliceInRoadmap(content, sliceId): string` — pure string transform, `^` + `m` anchored regex per D046
- `markSliceDoneInRoadmap(milestoneId, sliceId, cwd): boolean` — reads `.kata/milestones/<M>/M-ROADMAP.md`, calls `updateSliceInRoadmap`, writes back; returns false on any error

## Verification

- `npm test` → 112/112 pass, 0 fail
- `npx tsc --noEmit` → exits 0, no errors
- Module loads cleanly — `import(...)` → exports are functions and interfaces

## Diagnostics

- `mergeGitHubPR` failure shape: `{ ok: false, phase: "merge-failed", error: "<gh stderr>" }`
- `markSliceDoneInRoadmap` failure shape: returns `false` (boolean) — never throws

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/pr-merge-utils.ts` — 9 exported symbols; all pure or best-effort error-swallowed
