---
phase: 07-polish-and-edge-cases
plan: 01
subsystem: git-integration
tags: [git, worktree, submodule, error-handling, defensive-coding]
dependency-graph:
  requires: [05-real-time-updates]
  provides: [hardened-git-watcher, guarded-git-service]
  affects: [07-02, 07-03]
tech-stack:
  added: []
  patterns: [gitdir-pointer-resolution, pre-construction-guards]
key-files:
  created: []
  modified:
    - apps/electron/src/main/lib/git-watcher.ts
    - packages/shared/src/git/git-service.ts
decisions:
  - id: GIT-WORKTREE-RESOLVE
    description: Parse .git file gitdir pointer for worktree/submodule support
    outcome: resolveGitDir helper reads statSync + readFileSync with regex parse
metrics:
  duration: ~5 minutes
  completed: 2026-02-04
---

# Phase 7 Plan 1: Git Edge Case Hardening Summary

Defensive error handling for worktree/submodule support in GitWatcher and existsSync guards in GitService.

## What Changed

### GitWatcher (git-watcher.ts)

Added `resolveGitDir(workspaceDir)` internal helper that replaces the previous `existsSync(join(dir, '.git'))` check. The function uses `statSync` to determine whether `.git` is a directory (normal repo) or a file (worktree/submodule). For files, it parses the `gitdir: <path>` content and resolves relative paths against the workspace directory.

The error handler now detects ENOSPC errors (Linux inotify watch limit) and logs actionable instructions for increasing the limit.

### GitService (git-service.ts)

Added `existsSync(dirPath)` guards before `simpleGit()` construction in both `isGitRepository()` and `getGitStatus()`. This prevents the synchronous throw that simple-git produces when given a non-existent directory path. Return values are unchanged (false and defaultState respectively).

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 79f7a67 | feat(07-01): worktree/submodule support + ENOSPC handling in GitWatcher |
| 2 | 0e3879b | fix(07-01): existsSync guard in GitService before simpleGit construction |

## Verification

- `bun run typecheck:all` passes
- 14/14 git-service tests pass
- 683/683 shared package tests pass
- No console error noise from simple-git for non-existent directories

## Deviations from Plan

None. Plan executed exactly as written.

## Decisions Made

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use statSync + readFileSync for gitdir resolution | Synchronous is acceptable here since start() is already synchronous and called once per workspace | resolveGitDir returns string or null |
| Cast error to NodeJS.ErrnoException for ENOSPC check | Chokidar error type is `Error` but ENOSPC includes a `code` property | Check both message and code |
