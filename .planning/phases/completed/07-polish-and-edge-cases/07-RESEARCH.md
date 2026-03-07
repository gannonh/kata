# Phase 7: Polish and Edge Cases - Research

**Researched:** 2026-02-03
**Domain:** Git integration reliability, cross-platform compatibility, error handling
**Confidence:** HIGH (based on direct codebase analysis + verified library documentation)

## Summary

Phase 7 addresses edge cases and reliability improvements for the git integration implemented in Phases 3-6 (GitService, PrService, GitWatcher, git context injection). The codebase already handles many common cases well, but analysis reveals specific gaps in cross-platform support, error handling, large repository performance, and structural git edge cases.

The primary areas needing polish are: (1) git worktree support in GitWatcher (`.git` as file vs directory), (2) the legacy synchronous `GET_GIT_BRANCH` handler using `execSync`, (3) simple-git throwing synchronous errors for non-existent directories, (4) Linux inotify watch limits for chokidar, and (5) missing unit tests for GitWatcher.

**Primary recommendation:** Focus on defensive error handling, worktree/submodule compatibility in GitWatcher, removing the legacy sync handler, and adding integration tests for edge cases.

## Standard Stack

Already established in prior phases. No new libraries needed.

### Core
| Library    | Version  | Purpose            | Status               |
| ---------- | -------- | ------------------ | -------------------- |
| simple-git | ^3.30.0  | Git operations     | In use, stable       |
| chokidar   | ^4       | File watching      | In use, stable       |
| gh CLI     | system   | PR data            | In use via execFile  |

### Supporting (Testing)
| Library      | Version | Purpose              | When to Use              |
| ------------ | ------- | -------------------- | ------------------------ |
| bun:test     | system  | Unit tests           | All service tests        |
| Playwright   | system  | E2E tests            | UI integration tests     |

## Architecture Patterns

### Current Architecture (No Changes Needed)

```
packages/shared/src/git/
  git-service.ts       # getGitStatus, isGitRepository (simple-git)
  pr-service.ts        # getPrStatus (gh CLI)
  types.ts             # GitState, PrInfo
  index.ts             # Re-exports
  __tests__/           # Unit tests

apps/electron/src/main/
  lib/git-watcher.ts   # GitWatcher class (chokidar)
  ipc.ts               # IPC handlers + watcher lifecycle

apps/electron/src/renderer/
  atoms/git.ts          # Jotai state
  hooks/useGitStatus.ts # Real-time status hook
  hooks/usePrStatus.ts  # Focus-aware PR polling
  components/git/       # GitStatusBadge
  components/app-shell/input/FreeFormInput.tsx  # GitBranchBadge, PrBadge
```

### Pattern: Defensive Error Handling
All git operations already follow a good pattern: catch errors, return safe defaults, log for debugging. The polish phase should reinforce this pattern in the remaining gaps.

### Anti-Patterns to Avoid
- **execSync in IPC handlers:** The legacy `GET_GIT_BRANCH` handler uses `execSync` which blocks the main process. This is the only synchronous git operation remaining and should be addressed.
- **Assuming .git is always a directory:** Git worktrees use a `.git` file pointing to the actual git dir. The GitWatcher checks `existsSync(join(workspaceDir, '.git'))` which returns true for both files and directories, but then watches paths inside `.git/` which won't exist in a worktree.

## Don't Hand-Roll

| Problem                        | Don't Build           | Use Instead                     | Why                                       |
| ------------------------------ | --------------------- | ------------------------------- | ----------------------------------------- |
| Git status in worktrees        | Custom .git file parser | `git rev-parse --git-dir`     | Git resolves the actual git directory     |
| Cross-platform path handling   | Manual path joins      | `node:path` join/resolve      | Already used, keep using it               |
| File existence checks          | stat + catch           | `existsSync` for sync checks  | Already used, appropriate for startup     |
| Process timeout handling       | Custom timer           | simple-git `timeout` option   | Already configured (5s block timeout)     |

## Common Pitfalls

### Pitfall 1: Git Worktree .git File
**What goes wrong:** GitWatcher checks `existsSync(join(workspaceDir, '.git'))`. In a worktree, `.git` is a file containing `gitdir: /path/to/main/.git/worktrees/<name>`. The watcher then tries to watch `.git/HEAD`, `.git/index`, `.git/refs/heads/` which don't exist because `.git` is a file, not a directory.
**Why it happens:** Worktrees are uncommon but used by advanced developers.
**How to avoid:** Read the `.git` file content, parse the `gitdir:` reference, and watch the resolved git directory instead. Or use `git rev-parse --git-dir` to resolve the actual git directory.
**Warning signs:** GitWatcher.start() returns false for worktree directories; no file change events fire.

### Pitfall 2: simple-git Throws Synchronously for Missing Directories
**What goes wrong:** `simpleGit(dirPath)` throws synchronously (not async) when the directory doesn't exist. The error message is "Cannot use simple-git on a directory that does not exist". The test suite showed this error in the console output even though tests pass.
**Why it happens:** simple-git validates directory existence at construction time, before any async operations.
**How to avoid:** Check `existsSync(dirPath)` before calling `simpleGit(dirPath)`, or wrap the entire function in try/catch (which `getGitStatus` already does, but the error appears in console).
**Warning signs:** Console errors about non-existent directories, particularly when workspaces are deleted or paths change.

### Pitfall 3: Linux inotify Watch Limits
**What goes wrong:** On Linux, each file/directory watch consumes an inotify handle. The default limit is typically 8192. Chokidar can exhaust these, causing `ENOSPC` errors.
**Why it happens:** The GitWatcher watches selective paths (HEAD, index, refs/) which is good, but combined with other watchers in the app (config watcher, etc.) and external tools, limits can be reached.
**How to avoid:** The current selective watching strategy is correct. Document the inotify limit for Linux users. The MAX_GIT_WATCHERS=5 limit in ipc.ts helps prevent runaway watchers. Consider catching ENOSPC specifically and providing a user-friendly error message.
**Warning signs:** `ENOSPC: no space left on device, watch` errors on Linux.

### Pitfall 4: Legacy execSync Handler Blocking Main Process
**What goes wrong:** The `GET_GIT_BRANCH` IPC handler uses `execSync('git rev-parse --abbrev-ref HEAD')` which blocks the Electron main process. If git is slow (network filesystem, large repo), the entire UI freezes.
**Why it happens:** Legacy implementation predating the async GitService.
**How to avoid:** The handler is no longer called from the renderer (confirmed by grep). It can be removed or replaced with an async version using the GitService.
**Warning signs:** UI freezes when switching to a workspace on a slow filesystem.

### Pitfall 5: Race Condition on Rapid Workspace Switching
**What goes wrong:** Rapidly switching workspaces can cause git state from a previous workspace to arrive and be applied to the current workspace.
**Why it happens:** Async IPC calls for git status may complete after the workspace has changed.
**How to avoid:** The current implementation uses workspace-keyed Maps (`gitStateMapAtom`) which provides correct isolation. The `useGitStatus` hook checks workspace ID on state updates. The 500ms dedup threshold in `useGitStatus` also helps. This is already handled well.
**Warning signs:** Branch name showing from wrong workspace.

### Pitfall 6: gh CLI Timeout on Slow Networks
**What goes wrong:** The `getPrStatus` function has a 5-second timeout. On slow networks or when GitHub API is slow, this timeout fires and returns null, making PR badges disappear intermittently.
**Why it happens:** Network latency to GitHub API.
**How to avoid:** The 5-second timeout is reasonable. The 5-minute polling interval in `usePrStatus` provides resilience. Consider adding a brief "last known" cache so PR info doesn't flash away on timeout.
**Warning signs:** PR badge appearing and disappearing intermittently.

## Code Examples

### Resolving Actual Git Directory (for worktree support)
```typescript
// Pattern for resolving .git directory in worktrees
import { readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

function resolveGitDir(workspaceDir: string): string | null {
  const gitPath = join(workspaceDir, '.git')

  try {
    const stat = statSync(gitPath)

    if (stat.isDirectory()) {
      // Normal repo: .git is a directory
      return gitPath
    }

    if (stat.isFile()) {
      // Worktree: .git is a file with "gitdir: <path>"
      const content = readFileSync(gitPath, 'utf-8').trim()
      const match = content.match(/^gitdir:\s+(.+)$/)
      if (match) {
        const gitdir = match[1]
        // Resolve relative paths against workspace dir
        return resolve(workspaceDir, gitdir)
      }
    }
  } catch {
    // Not a git repo
  }

  return null
}
```

### Pre-checking Directory Existence for simple-git
```typescript
// Guard against synchronous throw from simple-git
import { existsSync } from 'node:fs'

export async function getGitStatus(dirPath: string): Promise<GitState> {
  const defaultState: GitState = {
    branch: null,
    isRepo: false,
    isDetached: false,
    detachedHead: null,
  }

  // Pre-check: simple-git throws synchronously if dir doesn't exist
  if (!existsSync(dirPath)) {
    return defaultState
  }

  // ... rest of implementation
}
```

### User-Friendly Error Messages for Common Failures
```typescript
// Pattern for translating git errors to user-friendly messages
function getGitErrorMessage(error: Error): string {
  const msg = error.message.toLowerCase()

  if (msg.includes('enospc')) {
    return 'File watcher limit reached. On Linux, increase inotify watches: echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf'
  }
  if (msg.includes('enoent') && msg.includes('git')) {
    return 'Git is not installed or not in PATH'
  }
  if (msg.includes('not a git repository')) {
    return 'This directory is not a git repository'
  }

  return 'Git operation failed'
}
```

## Edge Cases Inventory

Based on codebase analysis, these specific edge cases need attention:

### Already Handled
1. Non-git directories (returns safe defaults)
2. Detached HEAD state (shows commit hash)
3. gh CLI not installed (returns null)
4. gh not authenticated (returns null)
5. No PR for branch (returns null)
6. Workspace switching (Map-keyed state isolation)
7. Window focus/blur (dedup threshold, focus-aware polling)
8. Multiple concurrent git operations (maxConcurrentProcesses: 5)
9. Rapid file changes during rebase (100ms debounce)
10. Non-git workspace directories (silent handling in PrService)

### Needs Attention
1. Git worktrees (.git as file) - GitWatcher will fail silently
2. Non-existent directory path - simple-git throws synchronously
3. Legacy GET_GIT_BRANCH handler - uses execSync, dead code in renderer
4. Linux inotify limits - no user-friendly error
5. Very long branch names - truncation is at 120px CSS, but no server-side guard
6. Submodule .git file - same issue as worktrees
7. Bare repositories - `.git/HEAD` exists but no working tree
8. Git repositories on network filesystems - timeout may be insufficient
9. Permission errors reading .git directory - needs graceful handling

### Test Coverage Gaps
1. No unit tests for GitWatcher class
2. No unit tests for useGitStatus hook (would need React testing setup)
3. No unit tests for usePrStatus hook
4. No integration test for watcher -> IPC -> renderer flow
5. E2E test only covers non-git case (GIT-02)
6. No test for detached HEAD in E2E
7. No test for PR badge display
8. No performance test with large repositories

## State of the Art

| Old Approach              | Current Approach          | When Changed | Impact                            |
| ------------------------- | ------------------------- | ------------ | --------------------------------- |
| execSync for git branch   | simple-git async          | Phase 3      | No more main process blocking     |
| No git info               | Real-time git state       | Phase 5      | Branch changes detected instantly |
| No PR info                | Focus-aware PR polling    | Phase 4      | PR state visible in input toolbar |
| No agent git awareness    | XML context injection     | Phase 6      | Agent knows current branch/PR     |

**Legacy code to clean up:**
- `GET_GIT_BRANCH` IPC handler: Uses execSync, no longer called from renderer. Can be deprecated or removed.
- `getGitBranch` in preload/types: Exposed but unused. Can be removed alongside the handler.

## Cross-Platform Considerations

### macOS (Primary Development Platform)
- chokidar uses FSEvents via native `fsevents` package -- best performance
- simple-git works well, git is pre-installed or via Xcode tools
- Path separators: forward slashes, no issues

### Windows
- chokidar uses `fs.watch` -- functional but less efficient than FSEvents
- Git Bash detection already implemented (GITBASH_CHECK handler)
- Path separators: backslashes. All current code uses `node:path.join` which handles this
- `execFile('gh', ...)` in PrService -- gh CLI must be in PATH
- `.git` path resolution must handle backslashes

### Linux
- chokidar uses inotify -- efficient but has system-wide watch limits
- Default inotify limit (8192) may be insufficient with multiple watchers
- Git typically pre-installed, `gh` may need separate installation
- No special path handling needed

## Performance Considerations for Large Repos

### simple-git Performance
- `git status` is the primary operation. On a repo with 10k+ files, this can take 100-500ms depending on disk speed.
- Current 5-second timeout in getGitStatus is generous enough.
- `maxConcurrentProcesses: 5` prevents subprocess spam.
- `git rev-parse` operations are fast (< 10ms) regardless of repo size.

### chokidar Performance
- Watching selective paths (.git/HEAD, .git/index, .git/refs/) is already optimal.
- `depth: 2` limits recursion in refs directory.
- `awaitWriteFinish` with 100ms stability threshold handles atomic writes.
- MAX_GIT_WATCHERS=5 with LRU eviction prevents unbounded resource usage.

### Renderer Performance
- Jotai atoms use Map-based state -- O(1) lookup by workspace ID.
- 500ms dedup threshold in useGitStatus prevents redundant fetches.
- 2-second dedup threshold in usePrStatus prevents gh CLI spam.
- PR polling at 5-minute intervals is conservative and appropriate.

## Open Questions

1. **Should worktree support be a Phase 7 task or deferred?**
   - What we know: GitWatcher fails silently for worktrees. simple-git handles worktrees correctly (it calls git CLI which resolves worktrees natively).
   - What's unclear: How many users actually use worktrees.
   - Recommendation: Add worktree support to GitWatcher since the fix is small and prevents silent failures. Low risk, high defensive value.

2. **Should the legacy GET_GIT_BRANCH handler be removed?**
   - What we know: It's defined in ipc.ts, exposed in preload, typed in shared types, but never called from the renderer.
   - What's unclear: Whether any external code or plugins depend on it.
   - Recommendation: Mark as deprecated with a comment rather than removing, unless we're certain no external consumers exist.

3. **Should GitWatcher have unit tests?**
   - What we know: GitWatcher has no unit tests. Testing file watchers requires filesystem setup and timing.
   - What's unclear: Whether the ROI of testing a thin wrapper around chokidar is worth the effort.
   - Recommendation: Add integration tests that create a temp git repo, start the watcher, make a git operation, and verify the callback fires. This catches cross-platform issues.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis of all git-related files (git-service.ts, pr-service.ts, git-watcher.ts, ipc.ts, useGitStatus.ts, usePrStatus.ts, git.ts atoms, FreeFormInput.tsx, GitStatusBadge.tsx)
- Test execution: 27/27 tests passing across git-service.test.ts and pr-service.test.ts
- Test execution: 10/10 tests passing in git-context.test.ts
- Package.json versions: simple-git ^3.30.0, chokidar ^4

### Secondary (MEDIUM confidence)
- [chokidar GitHub](https://github.com/paulmillr/chokidar) - v4 cross-platform behavior, inotify limits
- [simple-git GitHub issues](https://github.com/steveukx/git-js/issues) - directory validation behavior
- [Git worktree documentation](https://git-scm.com/docs/git-worktree) - .git file format in worktrees

### Tertiary (LOW confidence)
- WebSearch results on Electron cross-platform testing patterns
- WebSearch results on simple-git performance with large repos (no specific benchmarks found; performance mirrors native git)

## Metadata

**Confidence breakdown:**
- Edge cases inventory: HIGH - based on direct code analysis
- Cross-platform concerns: HIGH - chokidar v4 and simple-git are well-documented
- Performance: MEDIUM - no benchmarks run, estimates based on git operation complexity
- Worktree support: MEDIUM - confirmed .git file format behavior, but simple-git worktree handling not directly verified

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (stable libraries, no breaking changes expected)
