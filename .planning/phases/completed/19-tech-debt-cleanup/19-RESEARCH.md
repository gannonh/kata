# Phase 19: Tech Debt Cleanup - RESEARCH

## Summary

Three non-blocking tech debt items identified by the v0.7.0 milestone audit. All are internal fixes requiring no new dependencies, no new features, and no user-facing changes.

---

## Item 1: Core Type Gap - Session Missing `channel` Field

### Current State

The `Session` interface in `@craft-agent/core` (`packages/core/src/types/session.ts`) has no `channel` field. The field exists in three separate locations, each with its own inline type definition:

| Location | Type Name | Has `channel`? |
|----------|-----------|----------------|
| `packages/core/src/types/session.ts` | `Session` | NO |
| `packages/shared/src/sessions/types.ts` | `SessionConfig` | YES (line 110) |
| `packages/shared/src/sessions/types.ts` | `SessionHeader` | YES (line 196) |
| `packages/shared/src/sessions/types.ts` | `SessionMetadata` | YES (line 255) |
| `apps/electron/src/shared/types.ts` | `Session` (Electron) | YES (line 339) |

The `channel` shape is identical everywhere:

```typescript
channel?: {
  adapter: string;
  slug: string;
  displayName?: string;
}
```

The core `Session` type is used as a base conceptual type. The shared package `SessionConfig`/`SessionHeader`/`SessionMetadata` types handle actual persistence. The Electron `Session` type handles runtime UI state. The core type is the canonical definition and should include the field.

### Desired State

Add `channel` to `packages/core/src/types/session.ts` `Session` interface. Extract the inline shape into a named type (`ChannelOrigin` or `SessionChannel`) to eliminate duplication.

### Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/types/session.ts` | Add `channel?: ChannelOrigin` to `Session`. Define `ChannelOrigin` type. Export it. |
| `packages/core/src/types/index.ts` | Add `ChannelOrigin` to exports. |
| `packages/shared/src/sessions/types.ts` | Import `ChannelOrigin` from core. Replace inline `channel` shapes in `SessionConfig`, `SessionHeader`, `SessionMetadata`. |
| `apps/electron/src/shared/types.ts` | Import `ChannelOrigin` from core. Replace inline `channel` shape in Electron `Session`. |

### Risks

- **LOW**: The field is optional (`channel?`), so adding it to the core type is backward-compatible. No runtime breakage.
- **LOW**: Downstream consumers already handle the absence of this field gracefully (e.g., `managed.channel ?? { adapter: ... }`).

### Confidence: HIGH

### Verification

1. `bun run typecheck:all` passes.
2. `bun test` passes.
3. The `ChannelOrigin` type is exported from `@craft-agent/core/types`.
4. Grep confirms no remaining inline `{ adapter: string; slug: string; displayName?: string }` for channel shapes.

---

## Item 2: Unused Plugin Initialization

### Current State

`PluginManager.initializeAll(context: PluginContext)` is defined at `packages/shared/src/plugins/plugin-manager.ts` line 63. It:

1. Iterates enabled plugins and calls `plugin.initialize?.(context)`.
2. Starts all registered services.
3. Sets `this.initialized = true`.

In `daemon/entry.ts`, the lifecycle is:

- `configure_channels` handler (line 131): creates `PluginManager`, calls `loadBuiltinPlugins()`, but **never calls `initializeAll()`**.
- Reconfigure path (line 139): calls `shutdownAll()` before recreating.
- Shutdown (line 253): calls `shutdownAll()`.

Current builtin plugins (`slackPlugin`, `whatsappPlugin`) have no `initialize` or `shutdown` methods. They only implement `registerChannels`. So the missing call has zero runtime impact today.

`initializeAll` requires a `PluginContext` argument with `workspaceRootPath`, `getCredential`, and `logger`. The daemon currently operates across multiple workspaces simultaneously (the `configure_channels` command receives an array of workspace configs). A single `PluginContext` with one `workspaceRootPath` does not map cleanly to the multi-workspace model.

### Desired State

Call `initializeAll()` after `loadBuiltinPlugins()` in the `configure_channels` handler. Since the daemon manages multiple workspaces, the context must either:

- **(Option A)** Use the config directory as `workspaceRootPath` (daemon-level context, not workspace-specific). This is the pragmatic choice since current plugins don't use the context.
- **(Option B)** Defer to a no-arg `initializeAll()` that skips context. This weakens the contract.

**Use Option A.** Pass `configDir` as `workspaceRootPath`. Credential lookup can be a no-op stub since channel credentials are already resolved by the Electron main process before delivery. The daemon entry already has `configDir` in scope.

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/daemon/entry.ts` | Add `await state.pluginManager.initializeAll(context)` after `loadBuiltinPlugins()` in the `configure_channels` handler (around line 147). Build a `PluginContext` from `configDir`. |

### Risks

- **LOW**: Current plugins have no `initialize` implementation, so calling it is a no-op.
- **LOW**: The `PluginContext.getCredential` stub returning `null` is safe because credential resolution happens in the Electron main process, not in plugins.

### Confidence: HIGH

### Verification

1. `bun test packages/shared` passes (existing plugin-manager tests cover `initializeAll` idempotency).
2. `bun run typecheck:all` passes.
3. Manual: start daemon via UI, observe no errors in daemon stderr logs.

---

## Item 3: Adapter Health Not Surfaced

### Current State

Both `SlackChannelAdapter` and `WhatsAppChannelAdapter` implement `isHealthy(): boolean` and `getLastError(): string | null`:

- **Slack** (`packages/shared/src/channels/adapters/slack-adapter.ts` line 255): Returns `false` after poll errors, when Socket Mode fails, or when stopped. Recovers to `true` after a successful poll.
- **WhatsApp** (`packages/shared/src/channels/adapters/whatsapp-adapter.ts` line 161): Returns `true` when WebSocket connection is open, `false` on disconnect/close.

`ChannelRunner` (`packages/shared/src/daemon/channel-runner.ts`) holds `RunningAdapter` instances keyed by slug but **never reads `isHealthy()` or `getLastError()`**.

`DaemonEvent` (`packages/core/src/types/daemon.ts`) has no `channel_health` or equivalent event type. The UI has no way to know an adapter is unhealthy.

### Desired State

1. Add a `channel_health` event to `DaemonEvent` in core types.
2. `ChannelRunner` periodically polls `isHealthy()` on running adapters and emits `channel_health` events.
3. The daemon entry emits these events, and the Electron main process forwards them to the renderer.

The health check interval should be conservative (30s) to avoid noise.

### Architecture Pattern

```
ChannelRunner (daemon)
  -> polls isHealthy() every 30s per adapter
  -> emits DaemonEvent { type: 'channel_health', channelId, healthy, error? }

daemon/entry.ts
  -> emit() forwards to stdout (existing pattern)

DaemonManager (Electron main)
  -> onEvent callback receives 'channel_health'
  -> forwards via IPC to renderer (existing DAEMON_EVENT channel)

Renderer
  -> existing onDaemonEvent listener receives health updates
```

### DaemonEvent Addition

```typescript
| {
    type: 'channel_health';
    /** Channel adapter slug */
    channelId: string;
    /** Whether the adapter is healthy */
    healthy: boolean;
    /** Error message if unhealthy, null if healthy */
    error: string | null;
  }
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/core/src/types/daemon.ts` | Add `channel_health` variant to `DaemonEvent` union. |
| `packages/shared/src/daemon/channel-runner.ts` | Add `startHealthChecks()` and `stopHealthChecks()` methods. Poll each adapter's `isHealthy()` on a 30s interval. Emit `channel_health` events via the `emit` callback. Track last-reported state to avoid duplicate emissions. |
| `packages/shared/src/daemon/entry.ts` | No changes needed. `ChannelRunner` already receives the `emit` function. Health events flow through the existing stdout pipeline. |

### Risks

- **LOW**: Health polling is read-only. No side effects on adapters.
- **LOW**: 30s interval with dedup means minimal event traffic.
- **MEDIUM**: UI consumption is out of scope for this phase (the events will be emitted but the renderer does not yet display them). This is acceptable for a tech debt cleanup. The event contract enables future UI work without another daemon change.

### Confidence: HIGH

### Verification

1. `bun test packages/shared` passes.
2. `bun run typecheck:all` passes.
3. Unit test: `ChannelRunner` emits `channel_health` events when adapter health changes.
4. Integration: daemon stderr logs show health check activity.

---

## Standard Stack

No new external dependencies. All changes use existing packages:

| Concern | Library/Pattern |
|---------|----------------|
| Types | TypeScript interfaces in `@craft-agent/core` |
| IPC | JSON-lines over stdin/stdout (existing) |
| Testing | Bun test runner (existing) |
| Health polling | `setInterval` (existing pattern from consumer loop in `entry.ts`) |

## Architecture Patterns

1. **Type extraction**: Define named types in `@craft-agent/core/types`, import elsewhere. Eliminates inline duplication.
2. **Event-driven health**: `ChannelRunner` emits `DaemonEvent` through the same `emit()` callback used for all daemon events. No new IPC channels needed.
3. **Dedup emissions**: Track `lastHealthState: Map<string, boolean>` in `ChannelRunner`. Only emit when state changes.

## Don't Hand-Roll

| Problem | Use Instead |
|---------|-------------|
| Custom IPC for health | Existing `DaemonEvent` union + `emit()` callback |
| Custom health timer | `setInterval` (same as consumer loop pattern) |
| Custom type sharing | `@craft-agent/core/types` subpath exports |

## Common Pitfalls

1. **Forgetting to export new types from barrel**: `packages/core/src/types/index.ts` must export `ChannelOrigin`.
2. **PluginContext multi-workspace mismatch**: The `workspaceRootPath` param on `PluginContext` implies single-workspace. Use `configDir` (daemon-level) as a pragmatic stand-in.
3. **Health check timer leak**: `ChannelRunner.stopAll()` must clear the health check interval. Add to the existing cleanup in `stopAll()`.
4. **Duplicate health emissions**: Without dedup, a stable adapter would emit `{ healthy: true }` every 30s. Track last state and only emit on change.
5. **Test import paths**: Tests import from `@craft-agent/core/types`. After adding `ChannelOrigin`, verify the subpath export includes it.

## Code Examples

### Item 1: ChannelOrigin type definition

```typescript
// packages/core/src/types/session.ts
export interface ChannelOrigin {
  /** Adapter type: 'slack', 'whatsapp', etc. */
  adapter: string;
  /** Channel config slug */
  slug: string;
  /** Display name for the channel source */
  displayName?: string;
}

export interface Session {
  // ... existing fields ...
  /** Channel origin for daemon-created sessions (absent for direct/interactive sessions) */
  channel?: ChannelOrigin;
}
```

### Item 2: initializeAll call in entry.ts

```typescript
// packages/shared/src/daemon/entry.ts (inside configure_channels handler, after loadBuiltinPlugins)
const pluginContext: PluginContext = {
  workspaceRootPath: configDir,
  getCredential: async () => null,
  logger: {
    info: (msg) => log(`[plugin] ${msg}`),
    warn: (msg) => log(`[plugin:warn] ${msg}`),
    error: (msg) => log(`[plugin:error] ${msg}`),
    debug: (msg) => log(`[plugin:debug] ${msg}`),
  },
};
await state.pluginManager.initializeAll(pluginContext);
```

### Item 3: Health check in ChannelRunner

```typescript
// packages/shared/src/daemon/channel-runner.ts
private healthTimer: ReturnType<typeof setInterval> | null = null;
private lastHealthState = new Map<string, boolean>();

startHealthChecks(intervalMs = 30_000): void {
  this.healthTimer = setInterval(() => {
    for (const [slug, { adapter }] of this.adapters) {
      const healthy = adapter.isHealthy();
      const prev = this.lastHealthState.get(slug);
      if (prev !== healthy) {
        this.lastHealthState.set(slug, healthy);
        this.emit({
          type: 'channel_health',
          channelId: slug,
          healthy,
          error: healthy ? undefined : adapter.getLastError() ?? undefined,
        });
      }
    }
  }, intervalMs);
}

stopHealthChecks(): void {
  if (this.healthTimer) {
    clearInterval(this.healthTimer);
    this.healthTimer = null;
  }
  this.lastHealthState.clear();
}
```
