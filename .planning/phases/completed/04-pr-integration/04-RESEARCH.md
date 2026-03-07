# Phase 4: PR Integration - Research

**Researched:** 2026-02-02
**Domain:** GitHub CLI (`gh`) integration, PR state detection, Electron IPC
**Confidence:** HIGH

## Summary

This research investigates how to integrate PR information display into the existing git branch badge. The approach leverages the `gh` CLI already present on developer machines (authenticated via `gh auth login`) to fetch PR data for the current branch.

The core challenge is executing `gh` CLI commands from the Electron main process asynchronously with proper error handling for cases where `gh` is not installed or not authenticated. The existing `simple-git` integration from Phase 3 provides a pattern template.

**Primary recommendation:** Extend the existing `GitState` type with PR information, add a new `getPrStatus()` function using Node.js `util.promisify(execFile)` to call `gh pr view --json`, and extend the GitBranchBadge component to show PR status with a clickable link.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Node.js `child_process` | built-in | Execute `gh` CLI commands | No external dependency needed |
| `util.promisify` | built-in | Wrap execFile for async/await | Native Node.js pattern |
| `gh` CLI | 2.x | GitHub PR data via JSON output | Already authenticated on dev machines, per prior decision |

### Supporting
| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `shell.openExternal` | Electron built-in | Open PR URL in browser | For PR badge click action |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| `gh` CLI | `@octokit/rest` | Requires separate OAuth flow, more complex auth management |
| `execFile` | `execa` | Would add dependency; execFile is sufficient for simple commands |
| `command-exists` | manual check | Could add but spawning gh and catching error is simpler |

**Installation:**
No new npm packages required. Uses Node.js built-ins and Electron shell module.

## Architecture Patterns

### Recommended Project Structure

Extend existing git module rather than creating new module:

```
packages/shared/src/git/
├── types.ts          # Extend GitState with PrInfo
├── git-service.ts    # Existing (no changes)
├── pr-service.ts     # NEW: getPrStatus function
└── index.ts          # Export new function and types
```

### Pattern 1: Promisified execFile for CLI Commands

**What:** Use `util.promisify(execFile)` for async CLI execution with timeout
**When to use:** Any CLI tool invocation from Electron main process
**Example:**
```typescript
// Source: Node.js child_process documentation
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function getPrStatus(dirPath: string): Promise<PrInfo | null> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'view',
      '--json', 'number,title,state,isDraft,url'
    ], {
      cwd: dirPath,
      timeout: 5000,  // 5 second timeout
    })
    return JSON.parse(stdout)
  } catch (error) {
    // gh not installed, not authenticated, no PR, or other error
    return null
  }
}
```

### Pattern 2: Graceful Degradation via Error Handling

**What:** Return null/default state on any failure, no thrown errors
**When to use:** All CLI integrations where feature is optional
**Example:**
```typescript
// Graceful handling for multiple failure modes
export async function getPrStatus(dirPath: string): Promise<PrInfo | null> {
  try {
    const { stdout } = await execFileAsync('gh', [...], { cwd: dirPath, timeout: 5000 })
    return JSON.parse(stdout)
  } catch (error: unknown) {
    // All failures return null - UI shows no PR badge
    // Possible causes:
    // - gh not installed (ENOENT)
    // - gh not authenticated (exit code 1)
    // - No PR for current branch (exit code 1, "no pull requests found")
    // - Network timeout
    // - Invalid JSON response
    if (process.env.DEBUG_GIT) {
      console.debug('[PrService] getPrStatus failed:', error)
    }
    return null
  }
}
```

### Pattern 3: Extend Existing Types (Additive)

**What:** Add new optional fields to existing types, don't modify structure
**When to use:** Adding new features to existing domain
**Example:**
```typescript
// types.ts - extend GitState
export interface PrInfo {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  url: string
}

// Option A: Separate function (recommended)
// getPrStatus() returns PrInfo | null separately from getGitStatus()

// Option B: Combine into GitState (simpler UI but couples concerns)
export interface GitState {
  branch: string | null
  isRepo: boolean
  isDetached: boolean
  detachedHead: string | null
  pr: PrInfo | null  // NEW: optional PR info
}
```

### Anti-Patterns to Avoid
- **Synchronous CLI calls:** Never use `execSync` from main process - blocks event loop
- **Shell execution:** Don't use `exec` with shell: true for gh commands - security risk
- **Polling too frequently:** PR status changes rarely; don't poll more than once per focus/branch change
- **Exposing full error details:** Don't leak gh auth errors to UI - just show "no PR"

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| Opening URLs | Manual window.open or anchor | `shell.openExternal(url)` | Electron handles OS integration, security |
| JSON CLI output | Parse text output | `gh --json` flag | Structured, stable API |
| Auth checking | Call `gh auth status` | Just call gh and handle error | Simpler, fewer round-trips |
| PR state icons | Custom SVG icons | Lucide icons (GitPullRequest, GitMerge) | Consistent with existing UI |

**Key insight:** The `gh` CLI is designed for scripting - use its `--json` output and error codes rather than parsing human-readable output.

## Common Pitfalls

### Pitfall 1: Assuming gh CLI is Always Available

**What goes wrong:** App crashes or shows confusing errors when gh not installed
**Why it happens:** Developer machines always have gh, production may not
**How to avoid:** Catch ENOENT error and treat as "no PR", don't show error to user
**Warning signs:** Error logs mentioning "command not found" or "ENOENT"

### Pitfall 2: Blocking Main Process with CLI Calls

**What goes wrong:** UI freezes during PR lookup
**Why it happens:** Using execSync or synchronous patterns
**How to avoid:** Always use promisified execFile with timeout
**Warning signs:** Spinning cursor during git operations, IPC timeout errors

### Pitfall 3: Over-fetching PR Data

**What goes wrong:** Rate limiting, slow UI, battery drain
**Why it happens:** Polling PR status too frequently or on every render
**How to avoid:** Fetch only on: 1) workspace load, 2) branch change, 3) window focus
**Warning signs:** Many gh processes in Activity Monitor, "API rate limit" errors

### Pitfall 4: Not Handling gh Auth Errors Gracefully

**What goes wrong:** Cryptic error messages in UI
**Why it happens:** gh returns different errors for not-logged-in vs network issues
**How to avoid:** Treat all gh errors the same - return null, no PR display
**Warning signs:** Error toasts mentioning "authentication" or "login required"

### Pitfall 5: Trusting PR State After Stale Period

**What goes wrong:** PR shows as "open" when already merged
**Why it happens:** PR data cached too long
**How to avoid:** Re-fetch on window focus; consider showing "last checked" indicator
**Warning signs:** User confusion about outdated PR status

## Code Examples

Verified patterns from official sources:

### Execute gh CLI with JSON Output
```typescript
// Source: Node.js child_process documentation + gh CLI docs
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

interface GhPrViewResult {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  url: string
}

export async function getPrForCurrentBranch(dirPath: string): Promise<GhPrViewResult | null> {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'view',
      '--json', 'number,title,state,isDraft,url'
    ], {
      cwd: dirPath,
      timeout: 5000,
      // No shell - execFile is safer
    })

    return JSON.parse(stdout) as GhPrViewResult
  } catch {
    // Any error = no PR to show
    return null
  }
}
```

### Check if gh CLI Exists (Optional)
```typescript
// Source: Node.js child_process documentation
// Only needed if you want to show "gh not installed" vs "no PR"
export async function isGhCliAvailable(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['--version'], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}
```

### Open PR in Browser
```typescript
// Source: Electron shell module docs + existing codebase pattern
import { shell } from 'electron'

// In IPC handler
ipcMain.handle('pr:open', async (_event, url: string) => {
  if (url.startsWith('https://github.com/')) {
    await shell.openExternal(url)
  }
})
```

### PR Badge Component Pattern
```typescript
// Source: Existing GitBranchBadge pattern in FreeFormInput.tsx
function PrBadge({ prInfo }: { prInfo: PrInfo | null }) {
  if (!prInfo) return null

  const statusIcon = prInfo.isDraft
    ? <GitPullRequestDraft className="h-3.5 w-3.5" />
    : prInfo.state === 'MERGED'
    ? <GitMerge className="h-3.5 w-3.5" />
    : <GitPullRequest className="h-3.5 w-3.5" />

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => window.electronAPI?.openExternal(prInfo.url)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md',
            'text-xs text-muted-foreground',
            'hover:bg-foreground/5 hover:text-foreground transition-colors',
          )}
        >
          {statusIcon}
          <span className="font-mono">#{prInfo.number}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">{prInfo.title}</p>
        <p className="text-muted-foreground">
          {prInfo.isDraft ? 'Draft' : prInfo.state.toLowerCase()} pull request
        </p>
      </TooltipContent>
    </Tooltip>
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| Parse gh text output | Use --json flag | gh 2.0+ | Stable API, no parsing bugs |
| Polling for PR status | Event-driven (focus, branch change) | N/A | Less resource usage |
| Custom OAuth for GitHub | Reuse gh CLI auth | By design | Zero auth configuration |

**Deprecated/outdated:**
- `node-github` / old octokit: Replaced by `@octokit/rest` v19+ - not relevant since using gh CLI
- `gh pr status` command: Use `gh pr view --json` for structured data

## Open Questions

Things that couldn't be fully resolved:

1. **Combine vs Separate IPC Calls**
   - What we know: Can either extend `getGitStatus()` to include PR or add separate `getPrStatus()`
   - What's unclear: Performance trade-off of two CLI calls vs code simplicity
   - Recommendation: Separate calls initially (simpler), combine later if perf issue emerges

2. **PR Badge Placement**
   - What we know: GitBranchBadge is in chat input toolbar
   - What's unclear: Should PR badge be adjacent to branch or integrated into same badge?
   - Recommendation: Adjacent (easier to implement), can combine UI later

3. **Refresh Strategy**
   - What we know: Don't want to poll constantly
   - What's unclear: Optimal triggers (branch change, focus, timer?)
   - Recommendation: Start with branch change + window focus, add manual refresh if needed

## Sources

### Primary (HIGH confidence)
- Node.js child_process documentation - execFile, promisify patterns
- gh CLI help output (`gh pr view --help`) - JSON fields, error behavior
- Existing codebase - `git-service.ts`, `ipc.ts`, `FreeFormInput.tsx` patterns

### Secondary (MEDIUM confidence)
- GitHub CLI releases - Version 2.86.0 is current, --json stable since 2.0

### Tertiary (LOW confidence)
- N/A - All findings verified with primary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using built-in Node.js modules, verified gh CLI behavior
- Architecture: HIGH - Following established Phase 3 patterns exactly
- Pitfalls: HIGH - Based on verified gh CLI error behavior and existing codebase patterns

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (gh CLI stable, patterns unlikely to change)
