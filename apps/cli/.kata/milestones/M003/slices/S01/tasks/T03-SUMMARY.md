---
id: T03
parent: S01
milestone: M003
provides:
  - gh-utils.ts with 5 exported detection/parsing functions (isGhInstalled, isGhAuthenticated, getCurrentBranch, parseBranchToSlice, detectGitHubRepo)
  - pr-body-composer.ts with composePRBody async function — composes markdown PR body from slice artifacts
key_files:
  - src/resources/extensions/pr-lifecycle/gh-utils.ts
  - src/resources/extensions/pr-lifecycle/pr-body-composer.ts
key_decisions:
  - resolveTaskFiles from paths.ts takes (tasksDir, suffix) not (milestoneId, sliceId, cwd) — composePRBody calls resolveTasksDir first then resolveTaskFiles on the result
  - parseBranchToSlice uses regex /^kata\/([A-Z]\d+)\/([A-Z]\d+)$/ — case-sensitive capital letters only
  - composePRBody returns task titles from individual task plan files when present, falls back to slice plan's Tasks section entries when no files found
  - All gh-utils.ts execSync calls use stdio: ['pipe','pipe','pipe'] as typed tuple to satisfy TypeScript strict mode
patterns_established:
  - gh-utils functions: try { execSync(..., PIPE); return true/value } catch { return false/null } — never throw
  - pr-body-composer imports from ../kata/paths.js and ../kata/files.js (ESM .js extension for Node resolution)
observability_surfaces:
  - parseBranchToSlice(getCurrentBranch(cwd)) returns null explicitly when branch format doesn't match kata/M###/S## — callers convert null to { ok: false, phase: "branch-parse-failed" }
  - composePRBody always returns non-empty string — failures in artifact reading degrade gracefully to fallback content
duration: 30m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Build `gh-utils.ts` and `pr-body-composer.ts`

**Implemented 5 pure detection functions in `gh-utils.ts` and `composePRBody` in `pr-body-composer.ts`; all 4 `pr-body-composer.test.ts` assertions pass with zero failures.**

## What Happened

Created `gh-utils.ts` with the five required detection/parsing functions, each using `execSync` with piped stdio and returning `null`/`false` on any error — no throws. The `parseBranchToSlice` regex matches `kata/M001/S01` format (uppercase letter + digits only).

Created `pr-body-composer.ts` importing from `../kata/paths.js` and `../kata/files.js`. The implementation:
1. Resolves and loads the slice plan via `resolveSliceFile` → `loadFile` → `parsePlan`
2. Resolves and loads the optional slice summary via `resolveSliceFile` → `loadFile` → `parseSummary` (graceful null check)
3. Resolves the tasks directory via `resolveTasksDir`, then gets file names via `resolveTaskFiles(tasksDir, "PLAN")`, joins with the tasks dir for full paths, loads and parses each via `parsePlan`
4. Composes `## What Changed`, `## Must-Haves`, `## Tasks` sections with fallback content when artifacts are absent

Key discovery: `resolveTaskFiles` in `paths.ts` takes `(tasksDir: string, suffix: string)`, not `(milestoneId, sliceId, cwd)` as implied by the task plan — used `resolveTasksDir` first to get the tasks directory.

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  --test 'src/resources/extensions/kata/tests/pr-body-composer.test.ts'

✔ composePRBody returns a non-empty string (7.046042ms)
✔ composePRBody output contains at least one markdown heading (2.321958ms)
✔ composePRBody output references the slice goal or task title (2.016667ms)
✔ composePRBody works for different milestone and slice IDs (1.922292ms)
ℹ pass 4 / fail 0

npx tsc --noEmit  → no errors
```

## Diagnostics

- `parseBranchToSlice(getCurrentBranch(cwd))` is the canonical idiom for T04 to derive milestoneId/sliceId; returns `null` on non-kata branches, making failures explicit
- `composePRBody` degrades gracefully: missing slice summary → "See slice plan: <title>"; no task files → falls back to slice plan's Tasks entries; both absent → returns non-empty fallback string

## Deviations

`resolveTaskFiles` signature in `paths.ts` is `(tasksDir: string, suffix: string)` not the `(milestoneId, sliceId, cwd)` form described in the task plan. Fixed by calling `resolveTasksDir(cwd, milestoneId, sliceId)` first. No API mismatch — just an inaccurate plan description.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/gh-utils.ts` — 5 pure detection/parsing functions: isGhInstalled, isGhAuthenticated, getCurrentBranch, parseBranchToSlice, detectGitHubRepo
- `src/resources/extensions/pr-lifecycle/pr-body-composer.ts` — composePRBody async function; composes ## What Changed / ## Must-Haves / ## Tasks from slice artifacts
