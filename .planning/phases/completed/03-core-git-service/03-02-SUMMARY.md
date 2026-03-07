---
phase: 03-core-git-service
plan: 02
subsystem: ipc
tags: [electron, ipc, preload, git-status]

dependency-graph:
  requires: [03-01]
  provides: [GIT_STATUS IPC channel, getGitStatus preload method]
  affects: [03-03, 04-x]

tech-stack:
  added: []
  patterns: [ipc-handler-async-git]

key-files:
  created: []
  modified:
    - apps/electron/src/shared/types.ts
    - apps/electron/src/main/ipc.ts
    - apps/electron/src/preload/index.ts

decisions:
  - id: backward-compatibility
    choice: Keep GET_GIT_BRANCH handler alongside GIT_STATUS
    rationale: FreeFormInput.tsx uses getGitBranch; avoid breaking existing code

metrics:
  duration: ~2 minutes
  completed: 2026-02-02
---

# Phase 03 Plan 02: IPC Layer Wiring Summary

**One-liner:** GIT_STATUS IPC channel wires async GitService to renderer via preload bridge, returning full GitState with detached HEAD support.

## What Was Built

Connected the GitService module (Plan 01) to the Electron IPC layer:

1. **IPC Channel Definition** (`shared/types.ts`):
   - Added `GIT_STATUS: 'git:status'` channel
   - Imported and re-exported `GitState` type from `@craft-agent/shared/git`
   - Added `getGitStatus(dirPath: string): Promise<GitState>` to ElectronAPI interface

2. **IPC Handler** (`main/ipc.ts`):
   - Import `getGitStatus` from `@craft-agent/shared/git`
   - Handler uses async `getGitStatus` (not execSync)
   - Returns full `GitState` object

3. **Preload Bridge** (`preload/index.ts`):
   - Added `getGitStatus` method invoking `IPC_CHANNELS.GIT_STATUS`
   - Exposes `window.electronAPI.getGitStatus(dirPath)` to renderer

## Key Implementation Details

- **Async-only**: GIT_STATUS handler uses the async `getGitStatus` from simple-git (never blocks main process)
- **Backward compatibility**: Existing `GET_GIT_BRANCH` handler preserved for `FreeFormInput.tsx`
- **Full GitState**: Returns `{ branch, isRepo, isDetached, detachedHead }` vs simple branch string
- **Type safety**: GitState type flows from shared package through types.ts to renderer

## Commits

| Hash | Type | Description |
|------|------|-------------|
| c09d079 | feat | Add GIT_STATUS IPC channel and GitState type |
| c01868d | feat | Add GIT_STATUS IPC handler using async GitService |
| 76a0c93 | feat | Expose getGitStatus in preload bridge |

## Files Changed

| File | Change |
|------|--------|
| `apps/electron/src/shared/types.ts` | Added GitState import/export, GIT_STATUS channel, ElectronAPI method |
| `apps/electron/src/main/ipc.ts` | Added getGitStatus import and GIT_STATUS handler |
| `apps/electron/src/preload/index.ts` | Added getGitStatus method to preload API |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `bun run typecheck:all` - PASS
- GIT_STATUS channel in IPC_CHANNELS - PASS
- GitState type exported from shared/types.ts - PASS
- IPC handler imports from `@craft-agent/shared/git` - PASS
- Preload exposes getGitStatus - PASS
- ElectronAPI interface includes getGitStatus - PASS

## Next Phase Readiness

**Ready for 03-03**: Git state management (workspace-scoped state, periodic refresh)

The IPC layer now provides:
- Renderer can request git status for any directory path
- Returns full GitState with branch, detached HEAD, and repo detection
- Async execution prevents main process blocking
- Type-safe interface for UI components

## Usage Example

```typescript
// In renderer process
const gitState = await window.electronAPI.getGitStatus('/path/to/workspace')

if (gitState.isRepo) {
  if (gitState.isDetached) {
    console.log(`Detached HEAD at ${gitState.detachedHead}`)
  } else {
    console.log(`On branch ${gitState.branch}`)
  }
} else {
  console.log('Not a git repository')
}
```
