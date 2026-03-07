---
phase: 19-tech-debt-cleanup
plan: 01
subsystem: core-types, daemon
tags: [typescript, types, daemon, health-polling, plugin-lifecycle]
dependency-graph:
  requires: [12-channel-adapters, 13-plugin-system, 15-channel-credentials]
  provides: [unified-channel-origin-type, plugin-initialization, adapter-health-events]
  affects: []
tech-stack:
  added: []
  patterns: [health-polling-with-dedup, type-centralization]
key-files:
  created: []
  modified:
    - packages/core/src/types/session.ts
    - packages/core/src/types/index.ts
    - packages/core/src/types/daemon.ts
    - packages/shared/src/sessions/types.ts
    - packages/shared/src/daemon/entry.ts
    - packages/shared/src/daemon/channel-runner.ts
    - apps/electron/src/shared/types.ts
    - apps/electron/src/main/sessions.ts
decisions:
  - id: 19-01-01
    description: "ChannelOrigin defined in core session.ts alongside Session interface (co-located, single source of truth)"
  - id: 19-01-02
    description: "Plugin initializeAll() getCredential returns null (daemon does not yet resolve per-source credentials)"
  - id: 19-01-03
    description: "Health polling interval set to 30s with dedup (emit only on state change)"
metrics:
  duration: 5m
  completed: 2026-02-15
---

# Phase 19 Plan 01: Core Type Gap, Plugin Init, and Adapter Health Summary

Closed three tech debt items from the v0.7.0 milestone audit: centralized the inline channel origin type, activated the unused plugin lifecycle hook, and surfaced adapter health via daemon events.

## Task Results

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Extract ChannelOrigin to core and unify Session types | 6961cf2 | session.ts, index.ts, sessions/types.ts, electron types.ts, sessions.ts |
| 2 | Call PluginManager.initializeAll() in daemon entry | 73f13d5 | daemon/entry.ts |
| 3 | Add channel_health event and health polling in ChannelRunner | 3e5d36e | daemon.ts, channel-runner.ts |

## What Changed

**Task 1: ChannelOrigin extraction.** Defined `ChannelOrigin` interface in `@craft-agent/core/types/session.ts` with `adapter`, `slug`, and optional `displayName` fields. Added it to the core `Session` interface and exported from the barrel. Replaced three inline `channel?: { adapter; slug; displayName? }` definitions in `SessionConfig`, `SessionHeader`, and `SessionMetadata` (shared package), plus the Electron `Session` and `ManagedSession` types. All five files now import `ChannelOrigin` from core.

**Task 2: Plugin initialization.** Added `initializeAll()` call in the daemon entry's `configure_channels` handler, immediately after `loadBuiltinPlugins()`. The `PluginContext` provides `configDir` as `workspaceRootPath`, a null credential getter (daemon doesn't resolve per-source credentials yet), and a logger that routes through the daemon's `log()` function.

**Task 3: Adapter health events.** Added `channel_health` variant to the `DaemonEvent` union with `channelId`, `healthy`, and `error` fields. `ChannelRunner` now polls `adapter.isHealthy()` every 30 seconds via `setInterval`. Events are deduplicated: `lastHealthState` map tracks the previous boolean per slug and only emits when state changes (or on first poll). The timer and state map are cleared in `stopAll()`.

## Decisions Made

1. **ChannelOrigin location:** Defined in `core/types/session.ts` alongside the Session interface rather than in a separate file. The type is small (3 fields) and semantically tied to sessions.
2. **Null credential getter:** `initializeAll()` receives `getCredential: async () => null` because the daemon does not currently resolve per-source credentials for plugin initialization. Future work can wire this to the credential store.
3. **30s health polling with dedup:** Interval matches common health check patterns. Dedup prevents event floods when adapters are stable. First poll fires after 30s (not immediately) to give adapters time to initialize.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated ManagedSession in electron/main/sessions.ts**

- **Found during:** Task 1
- **Issue:** The internal `ManagedSession` interface in `apps/electron/src/main/sessions.ts` also had an inline `channel?: { adapter; slug; displayName? }` type that was not listed in the plan's file list.
- **Fix:** Imported `ChannelOrigin` from `../shared/types` and replaced the inline type, consistent with the other files.
- **Files modified:** `apps/electron/src/main/sessions.ts`
- **Commit:** 6961cf2

## Verification Results

- `bun run typecheck:all`: zero errors across all four packages
- `bun test packages/shared`: 827/827 pass, 1260 expect() calls
- Inline `channel?: {` in shared sessions/types.ts: 0 matches (all replaced)
- `channel_health` in core daemon.ts: 1 match (correctly added)
- `initializeAll` in daemon entry.ts: 1 match (correctly wired)
