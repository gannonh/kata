---
phase: "05"
plan: "01"
subsystem: real-time-updates
tags: [git, file-watching, chokidar, ipc, electron]
depends_on: ["04"]
provides: ["GitWatcher class", "GIT_STATUS_CHANGED IPC channel", "onGitStatusChanged preload bridge"]
affects: ["05-03"]
tech_stack:
  added: ["chokidar@4.0.3"]
  patterns: ["selective file watching", "debounced event broadcast"]
key_files:
  created:
    - apps/electron/src/main/lib/git-watcher.ts
  modified:
    - apps/electron/package.json
    - apps/electron/src/shared/types.ts
    - apps/electron/src/preload/index.ts
    - apps/electron/src/main/ipc.ts
decisions:
  - id: "05-01-01"
    decision: "Use chokidar v4 for cross-platform .git file watching"
    rationale: "Native fs.watch unreliable across platforms; chokidar handles macOS FSEvents, Linux inotify, Windows differences"
  - id: "05-01-02"
    decision: "Watch selective .git paths (HEAD, index, refs/) not entire .git directory"
    rationale: "Prevents excessive events from git's internal files (FETCH_HEAD, ORIG_HEAD, packed-refs, objects/)"
  - id: "05-01-03"
    decision: "Auto-start watcher on first GIT_STATUS request rather than workspace open"
    rationale: "Lazy initialization avoids watching non-git workspaces; watcher starts naturally when UI requests status"
metrics:
  duration: "~2 minutes"
  completed: "2026-02-03"
---

# Phase 5 Plan 01: GitWatcher with IPC Broadcast Summary

Chokidar-based .git file watcher with debounced IPC broadcast to all renderer windows

## What Was Built

### GitWatcher Class (`apps/electron/src/main/lib/git-watcher.ts`)
- Watches selective .git paths: HEAD, index, refs/heads/, refs/remotes/
- 100ms debounce for rapid git operations (rebase, merge touch multiple files)
- Clean start/stop lifecycle with resource cleanup
- Returns false from start() if directory is not a git repo

### IPC Infrastructure
- `GIT_STATUS_CHANGED` channel added to IPC_CHANNELS constant
- `onGitStatusChanged` method added to ElectronAPI interface
- Preload bridge implementation with cleanup function pattern (matches existing patterns like onSourcesChanged, onSkillsChanged)

### IPC Integration
- `gitWatchers` Map manages per-workspace watcher instances (keyed by directory path)
- `broadcastGitChange()` sends to all non-destroyed windows
- GIT_STATUS handler auto-starts watcher on first request for a git repo
- `before-quit` handler cleans up all watchers

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 1cd7889 | Add GitWatcher class with chokidar file watching |
| 2 | 9d42c9e | Add GIT_STATUS_CHANGED IPC channel and preload bridge |
| 3 | 050e898 | Integrate GitWatcher into IPC layer with broadcast |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- Type checking (`bun run typecheck:all`): PASS
- All must_have artifacts verified present
- All key_links verified (GitWatcher -> ipc.ts -> preload)

## Next Phase Readiness

Plan 05-03 (renderer-side hook to consume GIT_STATUS_CHANGED events) can proceed. The `onGitStatusChanged` preload bridge is ready for the renderer to subscribe to.
