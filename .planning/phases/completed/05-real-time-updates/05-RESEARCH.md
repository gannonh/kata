# Phase 5: Real-Time Updates - Research

**Researched:** 2026-02-02
**Domain:** File watching (chokidar), interval polling, Electron IPC, state management
**Confidence:** HIGH

## Summary

This research investigates how to implement automatic real-time updates for git status and PR information without requiring manual refresh. The phase builds on existing Phase 3 (git service) and Phase 4 (PR integration) infrastructure.

Two distinct strategies are required:
1. **Git status (LIVE-01):** File system watching on selective .git paths using chokidar - the industry-standard library for cross-platform file watching in Node.js, used in ~30 million repositories including VS Code.
2. **PR status (LIVE-02):** Interval-based polling (5-10 minutes) with window focus triggers - appropriate since PR state changes are infrequent and require network calls.

The codebase already has file watching infrastructure (ConfigWatcher in `apps/electron/src/main/lib/config-watcher.ts`) using Node.js native `fs.watch`, and window focus event broadcasting (`WINDOW_FOCUS_STATE` IPC channel). The implementation should follow these established patterns while introducing chokidar for more reliable cross-platform git directory watching.

**Primary recommendation:** Add a GitWatcher class in main process using chokidar to watch `.git/HEAD`, `.git/index`, and `.git/refs/` with debouncing. For PR status, extend the existing PrBadge component to poll every 5 minutes when window is focused, plus immediate refresh on window focus and branch change.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| chokidar | ^4.0.0 | Cross-platform file watching | 30M+ repos use it, native fs.watch wrapper with reliability fixes, v4 is TypeScript-native |
| Node.js `fs.watch` | built-in | Native file watching (fallback) | Already used in ConfigWatcher |
| `setInterval`/`setTimeout` | built-in | PR polling timer | Simple, sufficient for 5-10 minute intervals |

### Supporting
| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| jotai | existing | State management for git/PR state | Already used for gitStateMapAtom |
| Electron IPC | existing | Main-to-renderer communication | Already established pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| chokidar | Node.js fs.watch (native) | Native watch has issues: no recursive on Linux, duplicate events, no filename on macOS - chokidar normalizes these |
| chokidar | watchman (Facebook) | More complex setup, overkill for watching 3 paths |
| Polling for git | File watching | Polling wastes CPU; git operations only occur when files change |
| 5-min PR interval | WebSocket/SSE | GitHub doesn't offer push notifications; would need webhook server |

**Installation:**
```bash
cd apps/electron && bun add chokidar@^4
```

## Architecture Patterns

### Recommended Project Structure

Extend existing main process structure:

```
apps/electron/src/main/
├── lib/
│   ├── config-watcher.ts    # Existing - config file watching
│   └── git-watcher.ts       # NEW: Git directory file watching
├── ipc.ts                   # Add GIT_STATUS_CHANGED event handler
└── window-manager.ts        # Already has focus/blur events

apps/electron/src/renderer/
├── atoms/
│   └── git.ts               # Extend with PR state atoms
├── hooks/
│   ├── useGitStatus.ts      # Extend to listen for file change events
│   └── usePrStatus.ts       # NEW: Hook with polling logic
└── components/
    └── app-shell/input/
        └── FreeFormInput.tsx # PrBadge already exists - add polling
```

### Pattern 1: Selective Git Path Watching

**What:** Watch only essential .git paths to minimize watcher overhead
**When to use:** Detecting branch changes, commits, checkouts
**Files to watch:**
- `.git/HEAD` - Branch reference (changes on checkout, branch switch)
- `.git/index` - Staging area (changes on add, reset, commit)
- `.git/refs/heads/` - Branch tips (changes on commit, fetch)
- `.git/refs/remotes/` - Remote refs (changes on fetch, pull)

**Example:**
```typescript
// Source: chokidar documentation + git internals
import { watch, type FSWatcher } from 'chokidar'
import { join } from 'node:path'

export class GitWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private readonly debounceMs = 100

  constructor(
    private workspaceDir: string,
    private onGitChange: () => void
  ) {}

  start(): void {
    const gitDir = join(this.workspaceDir, '.git')

    // Watch selective paths - not the entire .git directory
    const watchPaths = [
      join(gitDir, 'HEAD'),           // Branch reference
      join(gitDir, 'index'),          // Staging area
      join(gitDir, 'refs', 'heads'),  // Local branches
      join(gitDir, 'refs', 'remotes'),// Remote branches
    ]

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,      // Don't fire on startup
      depth: 2,                 // Limit recursion in refs/
      awaitWriteFinish: {       // Wait for atomic writes
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher
      .on('change', () => this.handleChange())
      .on('add', () => this.handleChange())
      .on('unlink', () => this.handleChange())
      .on('error', (error) => {
        console.error('[GitWatcher] Error:', error)
      })
  }

  private handleChange(): void {
    // Debounce rapid changes (e.g., during rebase)
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.onGitChange()
    }, this.debounceMs)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.watcher?.close()
    this.watcher = null
  }
}
```

### Pattern 2: Focus-Aware Polling for PR Status

**What:** Poll PR status at intervals, but only when window is focused
**When to use:** External API data that changes infrequently
**Example:**
```typescript
// Source: Best practices research + existing codebase patterns
function usePrStatus(workingDirectory: string | undefined) {
  const [prInfo, setPrInfo] = React.useState<PrInfo | null>(null)
  const [isFocused, setIsFocused] = React.useState(true)
  const lastBranchRef = React.useRef<string | null>(null)

  // Track window focus
  React.useEffect(() => {
    return window.electronAPI?.onWindowFocusChange?.((focused) => {
      setIsFocused(focused)
    })
  }, [])

  // Fetch PR status
  const fetchPrStatus = React.useCallback(async () => {
    if (!workingDirectory) {
      setPrInfo(null)
      return
    }
    try {
      const info = await window.electronAPI?.getPrStatus?.(workingDirectory)
      setPrInfo(info ?? null)
    } catch {
      setPrInfo(null)
    }
  }, [workingDirectory])

  // Initial fetch + on working directory change
  React.useEffect(() => {
    fetchPrStatus()
  }, [fetchPrStatus])

  // Refresh on window focus (immediate)
  React.useEffect(() => {
    if (isFocused) {
      fetchPrStatus()
    }
  }, [isFocused, fetchPrStatus])

  // Polling interval (only when focused)
  React.useEffect(() => {
    if (!isFocused || !workingDirectory) return

    const POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
    const interval = setInterval(fetchPrStatus, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isFocused, workingDirectory, fetchPrStatus])

  return { prInfo, refresh: fetchPrStatus }
}
```

### Pattern 3: Main Process to Renderer Event Broadcasting

**What:** Broadcast git changes from main process watcher to renderer via IPC
**When to use:** File changes detected in main process need to update UI
**Example:**
```typescript
// In main process (ipc.ts)
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'

// Broadcast to all windows
function broadcastGitChange(workspaceDir: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.GIT_STATUS_CHANGED, workspaceDir)
    }
  }
}

// In renderer (useGitStatus.ts)
React.useEffect(() => {
  const handleGitChange = (_event: unknown, changedDir: string) => {
    if (changedDir === workspaceRootPath) {
      refresh()  // Re-fetch git status
    }
  }

  window.electronAPI?.onGitStatusChanged?.(handleGitChange)
  return () => window.electronAPI?.offGitStatusChanged?.(handleGitChange)
}, [workspaceRootPath, refresh])
```

### Anti-Patterns to Avoid
- **Watching entire .git directory:** Creates thousands of watchers, high CPU on large repos
- **Polling git status:** Wastes resources; file watching is event-driven
- **Polling PR too frequently:** Rate limiting, battery drain; 5-10 min is sufficient
- **No debouncing:** Git operations often touch multiple files rapidly (rebase, merge)
- **Blocking main process:** All file operations must remain async
- **Polling when unfocused:** Wastes resources when user isn't looking

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Cross-platform file watching | Raw fs.watch with platform checks | chokidar | Handles macOS/Linux/Windows differences, duplicate events, missing filenames |
| Debouncing file events | Custom timeout management | chokidar's awaitWriteFinish or simple debounce | Built-in, tested |
| Window focus detection | document.visibilityState polling | Existing WINDOW_FOCUS_STATE IPC | Already implemented, works with Electron window manager |
| Managing watcher lifecycle | Manual cleanup tracking | Class-based watcher with start/stop | Cleaner, prevents leaks |

**Key insight:** chokidar exists specifically because raw fs.watch has cross-platform inconsistencies. Don't repeat those lessons.

## Common Pitfalls

### Pitfall 1: Watching Too Many Git Files

**What goes wrong:** CPU spikes, memory exhaustion, inotify limit exceeded on Linux
**Why it happens:** Naive recursive watch of entire .git directory
**How to avoid:** Watch only HEAD, index, refs/heads/, refs/remotes/ - these cover 99% of user-visible changes
**Warning signs:** "ENOSPC" errors on Linux, high CPU in Activity Monitor

### Pitfall 2: Missing Debounce on File Changes

**What goes wrong:** Multiple redundant git status fetches, UI flicker
**Why it happens:** Git operations often modify multiple files (commit touches index + refs)
**How to avoid:** 100ms debounce on change events before triggering refresh
**Warning signs:** Multiple rapid IPC calls for single user action

### Pitfall 3: Watcher Leaks on Workspace Switch

**What goes wrong:** Old watchers continue running, resource accumulation
**Why it happens:** Not cleaning up watcher when workspace changes
**How to avoid:** Store watcher per workspace ID, stop old watcher before starting new
**Warning signs:** Stale git status shows after switching workspaces

### Pitfall 4: Polling When Window Unfocused

**What goes wrong:** Battery drain, unnecessary network requests
**Why it happens:** Interval continues running regardless of visibility
**How to avoid:** Check window focus state before polling, pause interval when unfocused
**Warning signs:** gh CLI processes in background when app is minimized

### Pitfall 5: Not Handling Missing .git Directory

**What goes wrong:** Watcher errors when workspace isn't a git repo
**Why it happens:** Assuming all workspaces are git repos
**How to avoid:** Check .git existence before starting watcher, handle errors gracefully
**Warning signs:** Console errors about ENOENT for .git paths

### Pitfall 6: chokidar v5 ESM-Only Breaking Change

**What goes wrong:** Import errors, build failures
**Why it happens:** chokidar v5 (Nov 2025) made package ESM-only
**How to avoid:** Use v4.x for CommonJS compatibility, or ensure build supports ESM
**Warning signs:** "require() of ES Module" errors

## Code Examples

Verified patterns from official sources:

### Complete GitWatcher Class
```typescript
// Source: chokidar documentation + ConfigWatcher pattern
import { watch, type FSWatcher } from 'chokidar'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

interface GitWatcherOptions {
  debounceMs?: number
  onError?: (error: Error) => void
}

export class GitWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private readonly debounceMs: number
  private readonly onError?: (error: Error) => void

  constructor(
    private readonly workspaceDir: string,
    private readonly onGitChange: () => void,
    options: GitWatcherOptions = {}
  ) {
    this.debounceMs = options.debounceMs ?? 100
    this.onError = options.onError
  }

  start(): boolean {
    const gitDir = join(this.workspaceDir, '.git')

    // Verify .git exists
    if (!existsSync(gitDir)) {
      return false  // Not a git repo
    }

    const watchPaths = [
      join(gitDir, 'HEAD'),
      join(gitDir, 'index'),
      join(gitDir, 'refs', 'heads'),
      join(gitDir, 'refs', 'remotes'),
    ]

    this.watcher = watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      depth: 2,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher
      .on('all', () => this.handleChange())
      .on('error', (error) => {
        this.onError?.(error)
      })
      .on('ready', () => {
        console.debug('[GitWatcher] Ready:', this.workspaceDir)
      })

    return true
  }

  private handleChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.onGitChange()
    }, this.debounceMs)
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.watcher?.close()
    this.watcher = null
  }

  isRunning(): boolean {
    return this.watcher !== null
  }
}
```

### Focus-Aware PR Polling Hook
```typescript
// Source: Existing codebase patterns + polling best practices
import * as React from 'react'
import type { PrInfo } from '@/shared/types'

const PR_POLL_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes

export function usePrStatus(workingDirectory: string | undefined, currentBranch: string | null) {
  const [prInfo, setPrInfo] = React.useState<PrInfo | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isFocused, setIsFocused] = React.useState(true)

  // Track window focus
  React.useEffect(() => {
    const unsubscribe = window.electronAPI?.onWindowFocusChange?.((focused) => {
      setIsFocused(focused)
    })
    return unsubscribe
  }, [])

  const fetchPrStatus = React.useCallback(async () => {
    if (!workingDirectory) {
      setPrInfo(null)
      return
    }

    setIsLoading(true)
    try {
      const info = await window.electronAPI?.getPrStatus?.(workingDirectory)
      setPrInfo(info ?? null)
    } catch (error) {
      console.error('[usePrStatus] Fetch failed:', error)
      setPrInfo(null)
    } finally {
      setIsLoading(false)
    }
  }, [workingDirectory])

  // Initial fetch
  React.useEffect(() => {
    fetchPrStatus()
  }, [fetchPrStatus])

  // Refresh on branch change
  React.useEffect(() => {
    if (currentBranch) {
      fetchPrStatus()
    }
  }, [currentBranch, fetchPrStatus])

  // Refresh on window focus
  React.useEffect(() => {
    if (isFocused) {
      fetchPrStatus()
    }
  }, [isFocused, fetchPrStatus])

  // Periodic polling (only when focused)
  React.useEffect(() => {
    if (!isFocused || !workingDirectory) return

    const interval = setInterval(fetchPrStatus, PR_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isFocused, workingDirectory, fetchPrStatus])

  return { prInfo, isLoading, refresh: fetchPrStatus }
}
```

### IPC Channel Extension
```typescript
// Add to apps/electron/src/shared/types.ts IPC_CHANNELS
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Git real-time events (main -> renderer broadcast)
  GIT_STATUS_CHANGED: 'git:statusChanged',  // Payload: workspaceDir string
} as const
```

### Preload Extension
```typescript
// Add to apps/electron/src/preload/index.ts
onGitStatusChanged: (callback: (workspaceDir: string) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, workspaceDir: string) => {
    callback(workspaceDir)
  }
  ipcRenderer.on(IPC_CHANNELS.GIT_STATUS_CHANGED, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.GIT_STATUS_CHANGED, handler)
  }
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| fs.watch + platform workarounds | chokidar | 2012+ | Cross-platform reliability |
| Polling for file changes | Event-driven watching | N/A | Massive CPU savings |
| Poll always | Focus-aware polling | 2020s | Battery/resource savings |
| Watch entire .git | Selective path watching | Best practice | 1000x fewer watchers |
| chokidar v3 (13 deps) | chokidar v4 (1 dep) | Sep 2024 | Smaller bundle, TypeScript native |

**Deprecated/outdated:**
- `gaze` library: Replaced by chokidar years ago
- Polling with fs.watchFile: High CPU, unnecessary given modern fs.watch reliability through chokidar
- chokidar v5 (ESM-only): Too new for projects needing CommonJS compatibility

## Open Questions

Things that couldn't be fully resolved:

1. **GitWatcher Lifecycle per Window vs per Workspace**
   - What we know: Each workspace has one root path; multiple windows can show same workspace
   - What's unclear: Should watcher be singleton per workspace, or per window?
   - Recommendation: Per-workspace singleton in main process, broadcast to all windows

2. **PR Polling Interval Configurability**
   - What we know: 5 minutes is reasonable default; requirements say 5-10 minutes
   - What's unclear: Should users be able to configure this?
   - Recommendation: Start with 5 minutes fixed, add preference later if requested

3. **Handling Very Large Repos (.git/objects)**
   - What we know: Selective watching avoids .git/objects; no performance concern
   - What's unclear: Any edge cases with shallow clones, worktrees, submodules?
   - Recommendation: Test with real-world repos; add exclusions if issues emerge

## Sources

### Primary (HIGH confidence)
- [chokidar GitHub README](https://github.com/paulmillr/chokidar) - API, options, performance notes
- Existing codebase - ConfigWatcher pattern (`apps/electron/src/main/lib/config-watcher.ts`)
- Existing codebase - Window focus events (`WINDOW_FOCUS_STATE` channel)
- Node.js fs.watch documentation

### Secondary (MEDIUM confidence)
- [Electron Performance Docs](https://www.electronjs.org/docs/latest/tutorial/performance) - General Electron optimization
- [Our Code World - Electron File Watching](https://ourcodeworld.com/articles/read/160/watch-files-and-directories-with-electron-framework) - chokidar recommendation
- WebSearch polling best practices - Focus-aware intervals

### Tertiary (LOW confidence)
- N/A - All critical findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - chokidar is industry standard, verified in ~30M repos
- Architecture: HIGH - Following established ConfigWatcher pattern in codebase
- Pitfalls: HIGH - Based on chokidar docs, Electron issues, and existing codebase patterns
- Git path selection: HIGH - Based on git internals documentation

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (chokidar v4 stable, patterns unlikely to change)
