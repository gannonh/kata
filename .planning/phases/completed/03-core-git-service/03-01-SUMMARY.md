---
phase: 03-core-git-service
plan: 01
subsystem: git
tags: [simple-git, async, typescript]

dependency-graph:
  requires: []
  provides: [GitState, getGitStatus, isGitRepository]
  affects: [03-02, 03-03, 04-x]

tech-stack:
  added: [simple-git@^3.30.0]
  patterns: [async-only-git-operations]

key-files:
  created:
    - packages/shared/src/git/types.ts
    - packages/shared/src/git/git-service.ts
    - packages/shared/src/git/index.ts
  modified:
    - packages/shared/package.json
    - bun.lock

decisions:
  - id: git-library
    choice: simple-git
    rationale: 8.5M weekly downloads, TypeScript-native, structured StatusResult

metrics:
  duration: ~3 minutes
  completed: 2026-02-02
---

# Phase 03 Plan 01: GitService Foundation Summary

**One-liner:** Async GitService with simple-git for branch detection, detached HEAD handling, and graceful non-repo fallback.

## What Was Built

Created the foundational git service module at `packages/shared/src/git/` with:

1. **GitState type** (`types.ts`) - Core type for git status representation:
   - `branch: string | null` - Current branch name
   - `isRepo: boolean` - Whether directory is a git repository
   - `isDetached: boolean` - Detached HEAD state indicator
   - `detachedHead: string | null` - Short commit hash when detached

2. **GitService functions** (`git-service.ts`):
   - `isGitRepository(dirPath)` - Fast async check using `git rev-parse`
   - `getGitStatus(dirPath)` - Full status detection with timeout and concurrency limits

3. **Public exports** (`index.ts`) - Clean module boundary

4. **Subpath export** - Available as `@craft-agent/shared/git`

## Key Implementation Details

- **Async-only**: All operations use async/await to prevent main process blocking
- **Timeout**: 5 second block timeout prevents hangs on slow repositories
- **Concurrency**: `maxConcurrentProcesses: 5` prevents subprocess spam
- **Graceful degradation**: Non-git directories return safe defaults (no errors thrown)
- **Detached HEAD**: Detected and provides short commit hash for display

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 08ded6a | chore | Add simple-git dependency |
| 5f29c1f | feat | Create GitService module with async status detection |
| 3092960 | chore | Add subpath export for git module |

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/package.json` | Added simple-git dependency and ./git export |
| `packages/shared/src/git/types.ts` | Created GitState interface |
| `packages/shared/src/git/git-service.ts` | Created isGitRepository and getGitStatus functions |
| `packages/shared/src/git/index.ts` | Public exports |
| `bun.lock` | Updated with simple-git and its dependencies |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `bun run typecheck:all` - PASS
- `simple-git` in package.json - PASS (^3.30.0)
- Git module files exist - PASS (3 files)
- Subpath export configured - PASS (`./git`)

## Next Phase Readiness

**Ready for 03-02**: Git state management (workspace-scoped Map<workspaceId, GitState>)

The GitService provides the async primitives needed for:
- Initial workspace git state loading
- Periodic or event-driven state refresh
- UI branch display components

## Usage Example

```typescript
import { getGitStatus, isGitRepository, type GitState } from '@craft-agent/shared/git'

// Quick repo check
const isRepo = await isGitRepository('/path/to/workspace')

// Full status
const state: GitState = await getGitStatus('/path/to/workspace')
if (state.isRepo) {
  if (state.isDetached) {
    console.log(`Detached at ${state.detachedHead}`)
  } else {
    console.log(`On branch ${state.branch}`)
  }
}
```
