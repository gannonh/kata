# Phase 13 Plan 03: Daemon Wiring Summary

Wire PluginManager and TaskScheduler into daemon entry, add per-workspace enabledPlugins to config types, and update ChannelRunner to use plugin-provided adapter factories.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add enabledPlugins to WorkspaceConfig and DaemonCommand | `fbd334a` |
| 2 | Wire PluginManager and TaskScheduler into daemon entry | `5a9b599` |

## Key Artifacts

- `packages/core/src/types/daemon.ts` -- DaemonCommand with `configure_channels.enabledPlugins`, `schedule_task`, and DaemonEvent with `task_fired`
- `packages/shared/src/workspaces/types.ts` -- WorkspaceConfig.defaults.enabledPlugins
- `packages/shared/src/daemon/entry.ts` -- Daemon entry wiring PluginManager and TaskScheduler
- `packages/shared/src/daemon/__tests__/entry-integration.test.ts` -- Integration tests (5 tests)

## Design Decisions

- **Union of enabledPlugins**: The daemon collects enabled plugins as a union across all workspace `enabledPlugins` arrays. A single PluginManager instance serves all workspaces, filtered to the combined enabled set.
- **Reconfigure teardown**: On `configure_channels`, the daemon shuts down the existing PluginManager and ChannelRunner before creating new ones, matching the existing pattern from Phase 12.
- **Shutdown order**: Scheduler stops first (cancels timers, awaits in-flight), then PluginManager (stops services, calls plugin shutdown), then ChannelRunner (stops adapters), then MessageQueue (closes DB).
- **No ChannelRunner API changes**: The existing `adapterFactory` constructor parameter (from Phase 12 Plan 02) already supports injection. The daemon entry now explicitly passes `pluginManager.getAdapterFactory()`.

## Deviations

None. Plan executed as written.

## Verification

- `bun run typecheck:all` passes (all 4 packages)
- `bun test packages/shared/src/daemon/__tests__` -- 45 tests pass
- `bun test packages/shared/src/plugins/__tests__` -- 8 tests pass
- 53 total tests, 0 failures
