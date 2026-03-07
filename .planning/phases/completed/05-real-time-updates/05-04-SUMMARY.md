---
phase: "05-real-time-updates"
plan: "04"
subsystem: "renderer"
tags: ["git-branch-badge", "real-time", "gap-closure", "props", "pure-component"]

dependency-graph:
  requires: ["05-03"]
  provides: ["GitBranchBadge driven by live gitState prop from useGitStatus"]
  affects: ["07"]

tech-stack:
  added: []
  patterns: ["Prop-driven display component (no local fetch)", "Single source of truth for git state"]

key-files:
  created: []
  modified:
    - "apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx"

decisions:
  - id: "05-04-01"
    decision: "Rename prGitState to gitState since it now serves both GitBranchBadge and PrBadge"
    rationale: "Variable name prGitState was misleading; gitState accurately reflects shared usage"

metrics:
  duration: "~1 minute"
  completed: "2026-02-03"
---

# Phase 5 Plan 04: Wire GitBranchBadge to Live Git State (Gap Closure)

**GitBranchBadge refactored from local one-shot fetch to pure display component receiving live gitState prop, closing all three UAT failures**

## What Was Done

### Task 1: Refactor GitBranchBadge to accept gitState as a prop
- Removed local `useState<GitState | null>` from GitBranchBadge (was line 1875)
- Removed local `useEffect` that called `window.electronAPI.getGitStatus(workingDirectory)` one-shot on mount (was lines 1878-1894) -- this was the root cause of all three UAT failures
- Changed function signature from `{ workingDirectory }` to `{ gitState }` accepting `GitState | null`
- Updated call site from `<GitBranchBadge workingDirectory={workingDirectory} />` to `<GitBranchBadge gitState={gitState} />`
- Renamed `prGitState` to `gitState` at lines 253-254 for clarity since it now serves both badges
- Commit: `8010ab0`

### Task 2: Validate path consistency between useGitStatus and GitWatcher
- Confirmed `getGitStatus` only appears in `useGitStatus.ts` hook -- zero direct calls in any renderer component
- Confirmed useGitStatus uses `workspaceRootPath` (where .git lives), matching GitWatcher's broadcast key
- The old GitBranchBadge used `workingDirectory` (potentially a subdirectory), which was a secondary path mismatch bug -- now eliminated
- No code changes needed; validation-only task

## UAT Failures Resolved

| UAT ID | Description | Root Cause | Fix |
|--------|-------------|------------|-----|
| LIVE-01 | Branch badge does not update on git checkout | GitBranchBadge had its own useState/useEffect that fetched once on mount, never listened for GIT_STATUS_CHANGED events | Removed local fetch; receives gitState from useGitStatus which subscribes to GIT_STATUS_CHANGED |
| LIVE-02 | PR badge does not appear for branches with PRs | Same stale local state in GitBranchBadge confused testing; PrBadge itself was already wired correctly | Both badges now driven by same live gitState from useGitStatus |
| LIVE-03 | Badge does not update on window focus return | GitBranchBadge never subscribed to focus events | Receives gitState from useGitStatus which has focus-aware refresh with 100ms debounce |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript: `bun run typecheck:all` passes with zero errors
- Linting: `bun run lint:electron` passes with zero errors (47 pre-existing warnings, none related to this change)
- No `getGitStatus` calls in FreeFormInput.tsx (grep returns zero matches)
- No local `useState` for gitState in FreeFormInput.tsx (grep returns zero matches)
- `getGitStatus` only appears in `useGitStatus.ts` hook across entire renderer directory

## Architecture After Fix

```
GitWatcher (main process)
  -> GIT_STATUS_CHANGED IPC broadcast
    -> useGitStatus hook (subscribes to events + focus)
      -> gitState atom (Jotai store)
        -> FreeFormInput reads gitState
          -> GitBranchBadge (prop: gitState) -- pure display
          -> PrBadge (prop: currentBranch from gitState) -- triggers usePrStatus
```

Single source of truth: all git state flows through `useGitStatus` hook. No component fetches git status directly.
