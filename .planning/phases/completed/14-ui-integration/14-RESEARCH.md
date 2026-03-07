# Phase 14: UI Integration - Research

**Researched:** 2026-02-09
**Domain:** Electron system tray, daemon status indicators, channel configuration UI, unified session view, IPC event forwarding
**Confidence:** HIGH

## Summary

Phase 14 is the final phase of the v0.7.0 Always-On Assistant milestone. It connects the daemon subsystem (Phases 10-13) to the Electron renderer, making the always-on daemon visible and controllable through the UI. Five requirements: (1) daemon status indicator in the UI, (2) system tray icon for background operation, (3) channel configuration UI, (4) channel sessions in the unified session list, and (5) MCP tool attachment for channel sessions.

The codebase has all the backend infrastructure in place. `DaemonManager` exists in `apps/electron/src/main/daemon-manager.ts` with state tracking (`stopped`, `starting`, `running`, `stopping`, `error`, `paused`). Three IPC handlers (`daemon:start`, `daemon:stop`, `daemon:status`) are registered in `ipc.ts`. The preload bridge does NOT expose these handlers yet. The daemon emits events via `onEvent` and state changes via `onStateChange` callbacks, but these currently only log to the main process. The renderer has no daemon awareness.

Channel adapters, session resolution, message queue, plugin manager, and task scheduler all function in the daemon subprocess. The `Session` type lacks a channel/origin field. The `SessionMeta` type in the renderer atoms lacks channel attribution. The existing `SourceStatusIndicator` component provides the visual pattern for status dots. The `WorkspaceSettingsPage` provides the pattern for settings sections. The navigation system uses compound routes (`view/{filter}/chat/{sessionId}`) with navigator panels.

**Primary recommendation:** Wire daemon events through IPC to the renderer. Add a `daemonStateAtom` for global state and a `DaemonStatusIndicator` component. Create a `TrayManager` class in the main process. Extend `Session` with an optional `channel` field. Add a `ChannelSettingsPage` in the settings navigator. Channel sessions join the existing session list with a visual badge.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Electron `Tray` | Built-in | System tray icon and context menu | First-party Electron API. No alternatives. |
| Electron `nativeImage` | Built-in | Template images for tray (macOS dark/light) | First-party. Required for proper macOS menu bar rendering. |
| Jotai `atom` | Already installed | Daemon state atom for renderer | Already the state management library. Follows existing `sourcesAtom` pattern. |
| shadcn/ui components | Already installed | Settings forms, toggles, selects for channel config | Already used across all settings pages. |
| Lucide icons | Already installed | Icons for daemon status, channel types, tray states | Already the icon library. |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `motion/react` (Framer Motion) | Already installed | Animated transitions for status indicator | Already used in `WorkspaceSettingsPage`. Only for subtle pulse/transition animations. |
| `sonner` | Already installed | Toast notifications for daemon state changes | Already used for user feedback. "Daemon started" / "Daemon stopped" toasts. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Jotai atom for daemon state | React context | Would require a new context provider. Jotai atoms match the codebase pattern and support cross-component subscription without prop drilling. |
| Electron Tray API | `electron-tray-window` (npm) | Third-party wrapper adds complexity. The native Tray API is sufficient for context menu + tooltip. |
| Template image for tray | Regular PNG | Template images adapt to macOS light/dark menu bar automatically. Regular PNGs look wrong in light mode. |

**Installation:**
```bash
# No new dependencies needed. Everything is already installed.
```

## Architecture Patterns

### Recommended Project Structure

```
apps/electron/src/
├── main/
│   ├── daemon-manager.ts       # EXISTING: Spawns daemon, tracks state
│   ├── tray-manager.ts         # NEW: System tray lifecycle (DAEMON-07)
│   ├── ipc.ts                  # MODIFY: Forward daemon events to renderer, add channel config IPC
│   └── index.ts                # MODIFY: Wire tray manager, forward daemon state to renderer
├── preload/
│   └── index.ts                # MODIFY: Expose daemon + channel APIs to renderer
├── shared/
│   ├── types.ts                # MODIFY: Add daemon IPC channels, channel config types, Session.channel
│   └── routes.ts               # MODIFY: Add channels settings route
└── renderer/
    ├── atoms/
    │   └── daemon.ts           # NEW: daemonStateAtom, channelConfigAtom
    ├── components/
    │   ├── ui/
    │   │   └── daemon-status-indicator.tsx  # NEW: Status dot (DAEMON-03)
    │   └── app-shell/
    │       └── SessionList.tsx  # MODIFY: Channel session badge (CHAN-06)
    └── pages/
        └── settings/
            ├── ChannelSettingsPage.tsx   # NEW: Channel config UI (CHAN-03)
            └── SettingsNavigator.tsx     # MODIFY: Add channels entry
```

### Pattern 1: Daemon Event Forwarding (Main -> Renderer)

**What:** Forward `DaemonManager.onStateChange` and `DaemonManager.onEvent` to all renderer windows via `webContents.send`.

**When to use:** Any time daemon state changes or a daemon event occurs.

**Example:**
```typescript
// In index.ts, update the DaemonManager constructor callbacks:
daemonManager = new DaemonManager(
  'bun',
  daemonScript,
  configDir,
  (event) => {
    mainLog.info('[daemon] event:', event.type)
    // Forward to all windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.DAEMON_EVENT, event)
    }
  },
  (state) => {
    mainLog.info('[daemon] state:', state)
    // Forward state change to all windows
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.DAEMON_STATE_CHANGED, state)
    }
    // Update tray icon based on state
    trayManager?.updateState(state)
  },
)
```

**Existing pattern reference:** This follows the exact pattern used by `SESSION_EVENT`, `GIT_STATUS_CHANGED`, `SOURCES_CHANGED`, and `UPDATE_AVAILABLE` broadcasts. The `webContents.send` broadcast pattern is established throughout the codebase.

### Pattern 2: Daemon State Atom (Renderer)

**What:** A Jotai atom that holds the current `DaemonManagerState` and updates via IPC listener.

**When to use:** Any component that needs to display or react to daemon status.

**Example:**
```typescript
// atoms/daemon.ts
import { atom } from 'jotai'
import type { DaemonManagerState } from '../../shared/types'

export const daemonStateAtom = atom<DaemonManagerState>('stopped')
```

```typescript
// In AppShell.tsx useEffect, subscribe to daemon state changes:
useEffect(() => {
  // Fetch initial state
  window.electronAPI.getDaemonStatus().then((state) => {
    setDaemonState(state)
  })
  // Subscribe to changes
  const cleanup = window.electronAPI.onDaemonStateChanged((state) => {
    setDaemonState(state)
  })
  return cleanup
}, [])
```

**Existing pattern reference:** This mirrors how `sourcesAtom` is populated in `AppShell.tsx` lines 743-758: initial fetch with `.then()`, then subscribe with `onSourcesChanged` for live updates.

### Pattern 3: System Tray Manager (Main Process)

**What:** A `TrayManager` class that encapsulates Electron `Tray` lifecycle, context menu, and icon updates based on daemon state.

**When to use:** Created once in `index.ts` after app is ready.

**Example:**
```typescript
// tray-manager.ts
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import type { DaemonManagerState } from '../shared/types'

export class TrayManager {
  private tray: Tray | null = null

  constructor(
    private iconPath: string,
    private onShowWindow: () => void,
    private onStartDaemon: () => Promise<void>,
    private onStopDaemon: () => Promise<void>,
  ) {}

  create(): void {
    const icon = nativeImage.createFromPath(this.iconPath)
    // Resize for macOS menu bar (16x16 or 22x22 recommended)
    const resized = icon.resize({ width: 16, height: 16 })
    // Mark as template for macOS dark/light adaptation
    resized.setTemplateImage(true)
    this.tray = new Tray(resized)
    this.tray.setToolTip('Kata Agents')
    this.updateMenu('stopped')
  }

  updateState(state: DaemonManagerState): void {
    this.updateMenu(state)
    // Optionally update tooltip with state
    this.tray?.setToolTip(`Kata Agents - Daemon: ${state}`)
  }

  private updateMenu(state: DaemonManagerState): void {
    const isRunning = state === 'running'
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open Kata Agents',
        click: () => this.onShowWindow(),
      },
      { type: 'separator' },
      {
        label: isRunning ? 'Daemon Running' : 'Daemon Stopped',
        enabled: false,
      },
      {
        label: isRunning ? 'Stop Daemon' : 'Start Daemon',
        click: () => isRunning ? this.onStopDaemon() : this.onStartDaemon(),
      },
      { type: 'separator' },
      { role: 'quit' },
    ])
    this.tray?.setContextMenu(contextMenu)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
```

**Critical for background operation:** The `window-all-closed` handler in `index.ts` currently calls `app.quit()` on non-macOS platforms. When the tray is active and the daemon is running, this must change to keep the app alive:

```typescript
app.on('window-all-closed', () => {
  // Keep app alive when daemon is running (tray provides access)
  const daemonRunning = daemonManager?.getState() === 'running'
  if (process.platform === 'darwin' || daemonRunning) {
    return // Stay alive
  }
  app.quit()
})
```

### Pattern 4: Channel Session Badge in SessionList

**What:** Visual distinction for daemon-originated sessions in the session list. A small badge/icon next to the session title indicating the channel source.

**When to use:** When `SessionMeta` has a `channel` field set.

**Example:**
```typescript
// Session type extension
export interface Session {
  // ...existing fields...
  /** Channel origin for daemon-created sessions */
  channel?: {
    /** Channel adapter slug (e.g., 'slack', 'whatsapp') */
    adapter: string
    /** Channel slug for identifying the config */
    slug: string
  }
}
```

```tsx
// In SessionList item rendering:
{meta.channel && (
  <ChannelBadge adapter={meta.channel.adapter} />
)}
```

**Existing pattern reference:** The session list already renders badges for flags (`isFlagged`), labels (`labels`), unread (`hasUnread`), and permission mode. Adding a channel badge follows the same pattern.

### Pattern 5: Channel Configuration UI

**What:** A settings page under the workspace settings navigator where users configure which channels to monitor. Each channel config maps to a `ChannelConfig` object stored at `~/.kata-agents/workspaces/{id}/channels/{slug}/config.json`.

**When to use:** From Settings > Channels.

**Existing pattern reference:** The `SourcesListPanel` / `WorkspaceSettingsPage` pattern. A list of configured channels with enable/disable toggles, adapter type selection, credential source linking, and filter configuration.

### Anti-Patterns to Avoid

- **Polling daemon status from renderer.** Use push-based IPC events, not polling intervals. The daemon manager already has callbacks for state changes.
- **Storing daemon state in multiple places.** `DaemonManager.getState()` in main process is the source of truth. The renderer atom is a mirror updated via IPC. Do not duplicate state tracking logic.
- **Creating a separate window for tray menu.** Use Electron's built-in `Menu.buildFromTemplate` for the tray context menu. No custom HTML window needed.
- **Blocking the main process on daemon operations.** `daemonManager.start()` and `daemonManager.stop()` are already async. IPC handlers should await them but not block the event loop.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Tray icon state management | Custom tray state machine | `TrayManager` class wrapping Electron `Tray` API | Electron Tray handles platform differences. Keep it simple. |
| macOS menu bar icon adaptation | Separate light/dark icons | `nativeImage.setTemplateImage(true)` | Template images auto-adapt. Manual light/dark switching is unnecessary. |
| Status indicator dot | Custom SVG with animations | Extend existing `SourceStatusIndicator` pattern | Same visual language (colored dot with pulse), same tooltip pattern. |
| Channel config persistence | Custom JSON read/write | Extend existing source config pattern in `packages/shared/src/channels/` | Channel configs already have a defined `ChannelConfig` interface and storage path. |
| Session origin tracking | New session type hierarchy | Optional `channel` field on `Session` | Minimal change. Channel sessions are sessions with extra metadata, not a different type. |

## Common Pitfalls

### Pitfall 1: Tray Reference Garbage Collection
**What goes wrong:** The Tray object gets garbage collected and disappears from the menu bar.
**Why it happens:** JavaScript GC collects the Tray instance when no references exist. Common when Tray is created in a local scope.
**How to avoid:** Store the `TrayManager` instance in module-level variable in `index.ts`, same pattern as `windowManager`, `sessionManager`, `daemonManager`.
**Warning signs:** Tray icon appears briefly then vanishes.

### Pitfall 2: Preload Bridge Missing for New IPC Channels
**What goes wrong:** Renderer code calls `window.electronAPI.getDaemonStatus()` but gets undefined.
**Why it happens:** New IPC channels added to `ipc.ts` but not exposed in `preload/index.ts` and not typed in `ElectronAPI` interface.
**How to avoid:** For every new IPC channel, update three files: (1) `IPC_CHANNELS` constant, (2) `ElectronAPI` interface, (3) preload `api` object. The existing IPC plumbing pattern requires all three.
**Warning signs:** `TypeError: window.electronAPI.getDaemonStatus is not a function`.

### Pitfall 3: Race Condition on Initial Daemon State
**What goes wrong:** Renderer shows "stopped" briefly before switching to "running" on app load.
**Why it happens:** The renderer fetches initial state via `getDaemonStatus()` IPC call. If the daemon starts before the renderer mounts, the initial fetch returns 'running' correctly. But if the daemon hasn't started yet, the flash occurs.
**How to avoid:** The daemon does not auto-start (by design). The renderer's initial state of 'stopped' is correct. When the user starts the daemon, the state change event propagates immediately. No race condition in practice because `DaemonManager` does not auto-start.
**Warning signs:** N/A for v0.7.0 since daemon requires explicit start.

### Pitfall 4: `window-all-closed` Behavior Change Breaking Windows/Linux
**What goes wrong:** Users expect closing the last window to quit the app, but with tray support it stays alive.
**Why it happens:** The `window-all-closed` handler is modified to keep the app alive when daemon is running.
**How to avoid:** Only keep alive when daemon is actually running. If daemon is stopped and user closes all windows on Windows/Linux, quit normally. Also provide "Quit" in the tray context menu.
**Warning signs:** Users can't quit the app on Windows without using Task Manager.

### Pitfall 5: Channel Sessions Missing from SessionList
**What goes wrong:** Daemon creates sessions for channel messages but they don't appear in the renderer's session list.
**Why it happens:** Channel sessions are created in the daemon subprocess, which writes them to disk. The renderer loads sessions via `getSessions()` on workspace mount. If the daemon creates a session after the renderer has already loaded, the renderer doesn't know about it.
**How to avoid:** Forward daemon `message_received` events to the renderer. When the renderer sees a new channel session, reload sessions or add it to the atom. Alternatively, use the existing session file watcher pattern.
**Warning signs:** Channel sessions only appear after app restart.

### Pitfall 6: Template Image Not Working on Windows
**What goes wrong:** Calling `setTemplateImage(true)` on Windows has no effect. The icon might look wrong.
**Why it happens:** Template images are a macOS-only concept. Windows uses regular icons in the notification area.
**How to avoid:** Conditionally set template image only on macOS. Use a regular 16x16 PNG for all platforms, mark as template only on darwin.
**Warning signs:** Icon renders as black silhouette on Windows.

## Code Examples

### IPC Channel Additions (Types)

```typescript
// In IPC_CHANNELS constant (apps/electron/src/shared/types.ts)
// Add alongside existing DAEMON_START, DAEMON_STOP, DAEMON_STATUS:

// Daemon events (main → renderer broadcast)
DAEMON_STATE_CHANGED: 'daemon:stateChanged',
DAEMON_EVENT: 'daemon:event',

// Channel configuration (workspace-scoped)
CHANNELS_GET: 'channels:get',
CHANNELS_UPDATE: 'channels:update',
CHANNELS_DELETE: 'channels:delete',
```

### Preload Bridge Additions

```typescript
// In preload/index.ts, add to the api object:

// Daemon management
getDaemonStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DAEMON_STATUS),
startDaemon: () => ipcRenderer.invoke(IPC_CHANNELS.DAEMON_START),
stopDaemon: () => ipcRenderer.invoke(IPC_CHANNELS.DAEMON_STOP),
onDaemonStateChanged: (callback: (state: string) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, state: string) => {
    callback(state)
  }
  ipcRenderer.on(IPC_CHANNELS.DAEMON_STATE_CHANGED, handler)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.DAEMON_STATE_CHANGED, handler)
},
onDaemonEvent: (callback: (event: DaemonEvent) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, daemonEvent: DaemonEvent) => {
    callback(daemonEvent)
  }
  ipcRenderer.on(IPC_CHANNELS.DAEMON_EVENT, handler)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.DAEMON_EVENT, handler)
},
```

### Daemon State Atom

```typescript
// atoms/daemon.ts
import { atom } from 'jotai'
import type { DaemonManagerState } from '../../shared/types'
import type { ChannelConfig } from '@craft-agent/shared/channels'

/**
 * Current daemon process state, updated via IPC from main process.
 * Used by DaemonStatusIndicator and tray state.
 */
export const daemonStateAtom = atom<DaemonManagerState>('stopped')

/**
 * Channel configurations for the active workspace.
 * Loaded from workspace channels directory.
 */
export const channelConfigsAtom = atom<ChannelConfig[]>([])
```

### DaemonStatusIndicator Component

```tsx
// components/ui/daemon-status-indicator.tsx
// Follows SourceStatusIndicator pattern exactly.

const DAEMON_STATUS_CONFIG: Record<DaemonManagerState, {
  color: string
  pulseColor: string
  label: string
  description: string
}> = {
  running: {
    color: 'bg-success',
    pulseColor: 'bg-success/80',
    label: 'Running',
    description: 'Daemon is running and processing channel messages',
  },
  stopped: {
    color: 'bg-foreground/40',
    pulseColor: 'bg-foreground/30',
    label: 'Stopped',
    description: 'Daemon is not running',
  },
  starting: {
    color: 'bg-info',
    pulseColor: 'bg-info/80',
    label: 'Starting',
    description: 'Daemon is starting up',
  },
  stopping: {
    color: 'bg-info',
    pulseColor: 'bg-info/80',
    label: 'Stopping',
    description: 'Daemon is shutting down',
  },
  error: {
    color: 'bg-destructive',
    pulseColor: 'bg-destructive/80',
    label: 'Error',
    description: 'Daemon encountered an error',
  },
  paused: {
    color: 'bg-warning',
    pulseColor: 'bg-warning/80',
    label: 'Paused',
    description: 'Daemon paused after repeated failures',
  },
}
```

### Tray Icon Template Image (macOS)

```typescript
// Tray icon must be 16x16 pixels for macOS menu bar.
// Use Template suffix in filename for automatic dark/light adaptation.
// File: resources/trayIconTemplate.png and resources/trayIconTemplate@2x.png

const icon = nativeImage.createFromPath(
  join(resourcesDir, 'trayIconTemplate.png')
)
// Electron auto-detects Template suffix and sets template mode on macOS.
// For non-macOS, use the regular icon.
```

### Channel Config Storage Path

```
~/.kata-agents/workspaces/{workspaceId}/channels/
├── slack-general/
│   └── config.json          # ChannelConfig
├── whatsapp-support/
│   └── config.json          # ChannelConfig
```

This follows the existing source storage pattern at `~/.kata-agents/workspaces/{id}/sources/{slug}/`.

### Session Channel Field Extension

```typescript
// Extension to Session interface in shared/types.ts
export interface Session {
  // ...existing fields...
  /** Channel origin for daemon-created sessions (absent for direct/interactive sessions) */
  channel?: {
    /** Adapter type: 'slack', 'whatsapp', etc. */
    adapter: string
    /** Channel config slug */
    slug: string
    /** Display name for the channel source (e.g., '#general', 'Support Group') */
    displayName?: string
  }
}

// Extension to SessionMeta in atoms/sessions.ts
export interface SessionMeta {
  // ...existing fields...
  /** Channel info for daemon-created sessions */
  channel?: {
    adapter: string
    slug: string
    displayName?: string
  }
}
```

### MCP Tool Attachment for Channel Sessions (CHAN-07)

Channel sessions need MCP tools from the workspace's enabled sources. The existing session creation path already supports `enabledSourceSlugs`. When the daemon creates a session for a channel message, it should pass the workspace's default source slugs.

```typescript
// In daemon session creation, pass workspace sources:
const session = await createSession(workspaceId, {
  permissionMode: 'daemon',
  // Inherit workspace default sources for MCP tool access
  enabledSourceSlugs: workspaceConfig.defaultSourceSlugs,
})
```

The `CraftAgent` already connects to MCP servers based on `enabledSourceSlugs`. No new MCP integration needed. Channel sessions get tools through the same path as interactive sessions.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Custom window for tray interactions | Native `Menu.buildFromTemplate` context menu | Electron has always supported this | Simpler, platform-native. No custom HTML window needed. |
| Separate tray icons per state | Single template icon + tooltip text for state | macOS Big Sur onwards | Template images are the standard. Colored tray icons look non-native on modern macOS. |
| Polling for state changes | Push-based IPC events via `webContents.send` | Current Electron best practice | More efficient, instant updates. |

**Deprecated/outdated:**
- `Tray.setHighlightMode()`: Removed in Electron 7+. No longer needed.
- `remote` module for IPC: Removed. Use `ipcRenderer.invoke` / `ipcMain.handle` pattern (already used throughout codebase).

## Open Questions

1. **Tray icon asset**
   - What we know: Need a 16x16 (and @2x 32x32) PNG. On macOS, must be a template image (black + alpha). On Windows/Linux, can be the regular app icon resized.
   - What's unclear: Whether to create a new simplified icon for the tray or resize the existing app icon. The existing `icon.png` is the full app icon which may be too detailed at 16x16.
   - Recommendation: Create `resources/trayIconTemplate.png` (16x16) and `resources/trayIconTemplate@2x.png` (32x32) as a simplified monochrome version of the app icon. Use the existing `icon.png` resized for Windows/Linux.

2. **Channel session creation pathway**
   - What we know: The daemon subprocess handles message processing. Sessions need to be created with proper workspace context and MCP tool access.
   - What's unclear: Whether daemon creates sessions directly (writing JSONL) or requests creation via IPC to the main process. The daemon runs as a Bun subprocess with access to shared packages.
   - Recommendation: Daemon creates sessions directly using the shared `sessions` package (same as headless mode). Main process is notified via daemon events and refreshes the session list. This avoids IPC round-trips for every channel message.

3. **Channel config storage integration with Source system**
   - What we know: Channel configs reference source credentials via `credentials.sourceSlug`. Channels are a separate concept from sources but share credential infrastructure.
   - What's unclear: Whether channel configs should be surfaced as a new type of source or remain a separate entity with their own storage path and UI.
   - Recommendation: Keep channels separate from sources. They have different concerns (ingress vs. tool access). The channel config UI lives in Settings (not Sources). The credential reference is a simple slug pointer.

4. **Daemon auto-start on channel configuration**
   - What we know: Phase 12+ design says daemon does not auto-start. DaemonManager starts when channels are configured.
   - What's unclear: Should saving a channel config automatically start the daemon? Or should the user explicitly start it?
   - Recommendation: When a user enables their first channel in the config UI, prompt to start the daemon. After that, the daemon auto-starts on app launch if any channels are enabled. This provides a natural onboarding flow.

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/electronjs` - Tray API, nativeImage template images, IPC patterns, window-all-closed behavior
- Context7 `/websites/jotai` - atom patterns, onMount lifecycle, broadcast atom recipe
- Codebase analysis of `apps/electron/src/main/daemon-manager.ts` - DaemonManagerState type, callback signatures
- Codebase analysis of `apps/electron/src/main/ipc.ts` - existing daemon IPC handlers (lines 2546-2561)
- Codebase analysis of `apps/electron/src/shared/types.ts` - IPC_CHANNELS, ElectronAPI interface, Session interface
- Codebase analysis of `apps/electron/src/preload/index.ts` - confirms daemon APIs not exposed yet
- Codebase analysis of `apps/electron/src/renderer/atoms/sessions.ts` - SessionMeta type, atomFamily pattern
- Codebase analysis of `apps/electron/src/renderer/components/ui/source-status-indicator.tsx` - status dot pattern
- Codebase analysis of `packages/shared/src/channels/types.ts` - ChannelConfig, ChannelAdapter interfaces
- Codebase analysis of `packages/shared/src/channels/session-resolver.ts` - `daemon-{slug}-{hash}` session key format
- Codebase analysis of `packages/core/src/types/daemon.ts` - DaemonCommand, DaemonEvent types
- Codebase analysis of `packages/shared/src/agent/mode-types.ts` - daemon permission mode already exists with display config

### Secondary (MEDIUM confidence)
- Context7 Electron Tray tutorial - minimize to tray pattern, window-all-closed handler

### Tertiary (LOW confidence)
- None. All findings verified with primary or secondary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, Electron APIs are first-party
- Architecture: HIGH - Patterns directly derived from existing codebase conventions (IPC broadcasts, atom subscriptions, settings pages)
- Pitfalls: HIGH - Based on Electron documentation and observed codebase patterns (preload bridge, GC, template images)
- Code examples: HIGH - Derived from actual codebase patterns with specific file references

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain, no fast-moving dependencies)
