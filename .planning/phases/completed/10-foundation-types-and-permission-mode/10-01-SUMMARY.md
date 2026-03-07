---
phase: 10-foundation-types-and-permission-mode
plan: 01
subsystem: types
tags: [typescript, interfaces, plugin-contract, channel-adapter, daemon]

dependency-graph:
  requires: []
  provides:
    - KataPlugin interface (plugin contract)
    - ChannelAdapter interface (channel ingress)
    - DaemonStatus, DaemonCommand, DaemonEvent types (IPC)
  affects:
    - Phase 10 Plan 02 (daemon permission mode)
    - Phase 11 (daemon core)
    - Phase 12 (channel adapters)
    - Phase 13 (plugin lifecycle)

tech-stack:
  added: []
  patterns:
    - Discriminated unions for DaemonCommand and DaemonEvent
    - Dual ingress pattern (poll/subscribe) via ChannelAdapter.type
    - Optional registration methods on KataPlugin interface
    - Factory pattern in ChannelRegistry.addAdapter

key-files:
  created:
    - packages/shared/src/channels/types.ts
    - packages/shared/src/channels/index.ts
    - packages/shared/src/plugins/types.ts
    - packages/shared/src/plugins/index.ts
    - packages/core/src/types/daemon.ts
  modified:
    - packages/core/src/types/index.ts
    - packages/shared/package.json
    - packages/shared/src/agent/plan-types.ts

decisions:
  - id: channel-credential-ref
    decision: "ChannelConfig.credentials references a source slug rather than storing credentials directly"
    reason: "Reuses existing source credential infrastructure; single source of truth for secrets"
  - id: tool-registry-unknown
    decision: "ToolRegistry.addTool typed as unknown"
    reason: "SDK tool type integration deferred to Phase 11+; avoids premature coupling"

metrics:
  duration: "~5 minutes"
  completed: 2026-02-07
---

# Phase 10 Plan 01: Foundation Type Definitions Summary

Plugin contract, channel adapter, and daemon event types as pure TypeScript interfaces.

## What Was Done

**Task 1: Channel adapter and plugin contract types**
- Created `packages/shared/src/channels/types.ts` with ChannelAdapter (poll/subscribe discriminant), ChannelMessage, ChannelFilter, ChannelConfig
- Created `packages/shared/src/plugins/types.ts` with KataPlugin (3 optional registration methods), ChannelRegistry, ToolRegistry, ServiceRegistry, PluginService, PluginContext, PluginLogger
- Barrel re-exports in both index.ts files
- Subpath exports added to shared package.json

**Task 2: Daemon event types in core**
- Created `packages/core/src/types/daemon.ts` with DaemonStatus, DaemonCommand (4 variants), DaemonEvent (5 variants)
- Re-exported from `packages/core/src/types/index.ts` with comment header

## Deviations

**Blocking fix (Rule 3):** `PERMISSION_MODE_MESSAGES` and `PERMISSION_MODE_PROMPTS` in `plan-types.ts` were missing the `daemon` entry after `PermissionMode` was extended with `'daemon'` by a concurrent task on this branch. Added both entries to unblock typecheck.

## Verification

- `bun run typecheck:all` passes with zero errors
- All new files contain only type exports (no runtime code)
- Line counts: plugins/types.ts (112), channels/types.ts (111), daemon.ts (68)
- Cross-file import: plugins/types.ts imports ChannelAdapter from channels/types.ts
- Core re-export: daemon types available from @craft-agent/core
