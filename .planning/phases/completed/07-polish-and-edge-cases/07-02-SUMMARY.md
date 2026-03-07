---
phase: 07-polish-and-edge-cases
plan: 02
subsystem: ipc
tags: [git, async, deprecation, ipc, electron-main]
dependency-graph:
  requires: [phase-03]
  provides: [async-git-branch-handler, deprecated-legacy-git-api]
  affects: [phase-07-03]
tech-stack:
  added: []
  patterns: [async-ipc-delegation]
key-files:
  created: []
  modified:
    - apps/electron/src/main/ipc.ts
    - apps/electron/src/shared/types.ts
    - apps/electron/src/preload/index.ts
decisions:
  - id: D-0702-01
    decision: Retain execSync import (still used by GITBASH_CHECK handler)
    context: execSync removal only applies to git operations, not bash detection
metrics:
  duration: 54s
  completed: 2026-02-04
---

# Phase 7 Plan 2: Async GET_GIT_BRANCH Handler Summary

Replaced synchronous execSync git call in GET_GIT_BRANCH IPC handler with async delegation to GitService's getGitStatus, and added @deprecated JSDoc annotations across the handler chain.

## Changes

### Task 1: Replace execSync with async GitService delegation
**Commit:** `5d98874`

Rewrote the GET_GIT_BRANCH IPC handler from a synchronous `execSync('git rev-parse --abbrev-ref HEAD')` call to an async handler that calls `getGitStatus(dirPath)` and returns `status.branch`. This eliminates the last synchronous git operation in the main process, preventing UI freezes on slow filesystems or large repositories.

The handler's return type (`string | null`) and channel name remain unchanged for backward compatibility.

### Task 2: Add deprecation annotations
**Commit:** `ca01e07`

Added `@deprecated` JSDoc comments to three locations:
- `IPC_CHANNELS.GET_GIT_BRANCH` in types.ts (directs to GIT_STATUS)
- `ElectronAPI.getGitBranch` in types.ts (directs to getGitStatus)
- `getGitBranch` bridge method in preload/index.ts (directs to getGitStatus)

IDE users now see deprecation strikethrough and warnings when referencing the legacy API.

## Deviations from Plan

None. Plan executed exactly as written.

## Verification

- `bun run typecheck:all` passes
- `bun test` passes (1312/1312 tests)
- No `execSync.*rev-parse` remaining in ipc.ts
- `@deprecated` annotations present on all three deprecation points
- `execSync` import retained (used by GITBASH_CHECK handler at line 906)
