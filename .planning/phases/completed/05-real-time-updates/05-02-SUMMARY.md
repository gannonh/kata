---
phase: 05-real-time-updates
plan: 02
subsystem: renderer
tags: [react-hooks, polling, focus-awareness, pr-status]
requires:
  - phase-04 (PR badge and PrService)
provides:
  - Focus-aware PR polling hook (usePrStatus)
  - PrBadge refactored to use usePrStatus
affects:
  - 05-03 (git status focus-aware refresh uses same pattern)
tech-stack:
  added: []
  patterns:
    - Focus-aware polling (pause on blur, resume on focus)
    - Window focus state tracking via IPC
key-files:
  created:
    - apps/electron/src/renderer/hooks/usePrStatus.ts
  modified:
    - apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx
decisions:
  - id: pr-branch-source
    decision: "Use useGitStatus hook in FreeFormInput to provide currentBranch to PrBadge"
    reason: "Reuses existing git state infrastructure; avoids duplicate IPC calls"
metrics:
  duration: ~2 minutes
  completed: 2026-02-03
---

# Phase 5 Plan 2: Focus-Aware PR Polling Summary

**One-liner:** usePrStatus hook with 5-minute focus-aware polling and PrBadge refactored to use it

## What Was Done

### Task 1: Created usePrStatus hook
- New hook at `apps/electron/src/renderer/hooks/usePrStatus.ts`
- 5-minute periodic polling interval when window is focused
- Polling automatically pauses when window loses focus (saves battery/resources)
- Refreshes PR status on window focus gain
- Refreshes PR status on branch change (tracked via ref comparison)
- Initial fetch on mount and working directory change
- Exports: `usePrStatus(workingDirectory, currentBranch)` returning `{ prInfo, isLoading, refresh }`

### Task 2: Refactored PrBadge to use usePrStatus
- Removed inline `useState`/`useEffect` PR fetching from PrBadge component
- PrBadge now accepts `currentBranch` prop for branch-change-triggered refresh
- Added `useGitStatus` hook call in FreeFormInput to supply branch data
- Removed unused `PrInfo` type import from FreeFormInput.tsx
- Net reduction: 11 lines added, 22 lines removed (simpler component)

## Decisions Made

| Decision | Options Considered | Chosen | Reason |
|----------|-------------------|--------|--------|
| Branch data source for PrBadge | Direct IPC call in PrBadge vs useGitStatus in parent | useGitStatus in FreeFormInput parent | Reuses existing Jotai-based git state; avoids duplicate IPC; follows hook composition pattern |

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- [x] `bun run typecheck:all` passes
- [x] usePrStatus hook exports usePrStatus function
- [x] PrBadge uses usePrStatus hook
- [x] PrBadge receives currentBranch prop
- [x] PR polling interval set to 5 minutes
- [x] Polling pauses when window is unfocused
- [x] PR status refreshes on window focus
- [x] PR status refreshes on branch change

## Commits

| Hash | Message |
|------|---------|
| 197a623 | feat(05-02): create usePrStatus hook with focus-aware polling |
| 5d58620 | feat(05-02): refactor PrBadge to use usePrStatus hook |

## Next Phase Readiness

Plan 05-03 (useGitStatus focus-aware refresh) can follow the same focus-aware polling pattern established here. The `onWindowFocusChange` IPC bridge is already wired and proven working.
