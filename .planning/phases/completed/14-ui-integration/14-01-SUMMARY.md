---
phase: 14-ui-integration
plan: 01
subsystem: electron-main, electron-renderer
tags: [ipc, tray, daemon, jotai, react]
dependency-graph:
  requires: [11-02, 13-03]
  provides: [daemon-ipc-bridge, tray-manager, daemon-status-indicator, session-channel-type]
  affects: [14-02]
tech-stack:
  added: []
  patterns: [daemon-event-forwarding, tray-lifecycle, daemon-state-atom]
key-files:
  created:
    - apps/electron/src/main/tray-manager.ts
    - apps/electron/src/renderer/atoms/daemon.ts
    - apps/electron/src/renderer/components/ui/daemon-status-indicator.tsx
    - apps/electron/resources/trayIconTemplate.png
    - apps/electron/resources/trayIconTemplate@2x.png
  modified:
    - apps/electron/src/shared/types.ts
    - apps/electron/src/preload/index.ts
    - apps/electron/src/main/index.ts
    - apps/electron/src/renderer/atoms/sessions.ts
decisions:
  - TrayManager uses nativeImage template on macOS only; regular icon on other platforms
  - DaemonManagerState type duplicated in shared/types.ts (portable, no cross-boundary import)
  - trayManager variable typed as TrayManager (not duck-typed interface)
  - window-all-closed keeps app alive when daemon running on all platforms
metrics:
  duration: 5m
  completed: 2026-02-09
---

# Phase 14 Plan 01: Daemon IPC Bridge, TrayManager, and DaemonStatusIndicator Summary

IPC bridge for daemon state/events with TrayManager and DaemonStatusIndicator, plus Session.channel type extension for daemon-created sessions.

## Tasks Completed

### Task 1: IPC channels, preload bridge, Session.channel type, tray icon assets, daemon event forwarding

- Added `DAEMON_STATE_CHANGED` and `DAEMON_EVENT` IPC channels to `IPC_CHANNELS` constant
- Added inline `DaemonManagerState` type to `shared/types.ts` (6 states: stopped, starting, running, stopping, error, paused)
- Extended `Session` interface with optional `channel` field (adapter, slug, displayName) for daemon-created sessions
- Added 5 daemon management methods to `ElectronAPI` interface: `getDaemonStatus`, `startDaemon`, `stopDaemon`, `onDaemonStateChanged`, `onDaemonEvent`
- Extended preload bridge with all 5 daemon management methods using existing IPC invoke/on patterns
- Updated `DaemonManager` constructor callbacks in `index.ts` to broadcast events and state to all renderer windows via `webContents.send`
- Modified `window-all-closed` handler to keep app alive when daemon is running (all platforms)
- Created tray icon assets: `trayIconTemplate.png` (16x16) and `trayIconTemplate@2x.png` (32x32) from existing app icon

### Task 2: TrayManager, daemon state atom, DaemonStatusIndicator

- Created `TrayManager` class in `apps/electron/src/main/tray-manager.ts` with create/updateState/destroy lifecycle
- TrayManager context menu: Show Window, daemon status label, Start/Stop Daemon (disabled during transitions), Quit
- Template image set on macOS only; regular icon on other platforms
- Wired TrayManager into `index.ts` after DaemonManager creation with show window, start/stop daemon callbacks
- Added tray cleanup to `before-quit` handler
- Created `daemonStateAtom` in `apps/electron/src/renderer/atoms/daemon.ts` (Jotai atom, default: 'stopped')
- Created `DaemonStatusIndicator` component following `SourceStatusIndicator` pattern: colored dot with pulse animation (running), tooltip with label and description for all 6 states
- Extended `SessionMeta` interface with optional `channel` field and wired it in `extractSessionMeta`

## Deviations

None.

## Verification Results

- `bun run typecheck:all` passes
- `bun run lint:electron` passes (47 pre-existing warnings, 0 errors, no new warnings)
- All IPC channels, preload methods, types, and components verified present
