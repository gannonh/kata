# Hybrid Architecture: Consolidated Report

**Explorer:** explorer-hybrid
**Challenger:** challenger-hybrid
**Date:** 2026-02-07

## Executive Summary

After 3 rounds of debate, the hybrid team converges on a modified **Proposal 3 (Thin Plugin Contract with Tool Injection)** as the recommended architecture for v0.7.0 "Always-On Assistant." The approach combines NanoClaw's single-process simplicity with the thinnest viable slice of OpenClaw's plugin extensibility. Six proposals were evaluated; three were eliminated through debate (Source-Native, Headless Multiplexer, launchd Daemon). The surviving recommendation merges the strongest elements of Proposals 2, 3, and 6.

## Recommended Architecture

### Core Pattern: Single-Process Daemon with Plugin Registry

**From NanoClaw:** Single Bun process for the daemon. No microservices, no gateway. SQLite for message queue and task state. Polling loops with debouncing for API-based channels.

**From OpenClaw:** Plugin contract interface with three registration points (`registerChannel`, `registerTool`, `registerService`). Plugin discovery and loading via manifest files. Explicit plugin enable/disable per workspace.

**From Kata Agents:** Daemon spawned as Bun subprocess by Electron main process (same pattern as agent sessions). Shared credential management via CredentialManager. Workspace-scoped configuration. Per-channel CraftAgent sessions with compaction.

### Plugin Interface

```typescript
// Plugin definition (what plugin authors implement)
interface KataPlugin {
  id: string
  name: string
  version: string
  register(api: KataPluginApi): void
}

// Registration API (what the daemon provides to plugins)
interface KataPluginApi {
  registerChannel(adapter: ChannelAdapter): void
  registerTool(tool: AgentTool): void
  registerService(service: PluginService): void
}
```

Three registration methods. No more. If a feature cannot be expressed through channel, tool, or service registration, it is out of scope for v0.7.0.

### Channel Adapter Interface

Supports both polling-native channels (Gmail, Slack Web API) and WebSocket-native channels (Discord, WhatsApp) through a dual ingress pattern:

```typescript
interface ChannelAdapter {
  id: string
  connect(ctx: ChannelContext): Promise<void>
  disconnect(): Promise<void>
  send(message: OutboundMessage): Promise<SendResult>

  // Adapters implement one of these:
  poll?(since: string): Promise<PollResult>
  subscribe?(handler: (msg: InboundMessage) => void): void
}

// Poll result with structured error signaling
type PollResult =
  | { ok: true; messages: InboundMessage[] }
  | { ok: false; error: ChannelError }

type ChannelError =
  | { code: 'rate_limited'; retryAfterMs: number }
  | { code: 'auth_expired'; message: string }
  | { code: 'connection_lost'; message: string }
  | { code: 'unknown'; message: string }

interface InboundMessage {
  id: string
  channelId: string
  from: string
  content: string
  threadId?: string
  replyTo?: string
  attachments?: Attachment[]
  metadata?: Record<string, unknown>
  timestamp: string  // ISO 8601
}

interface OutboundMessage {
  channelId: string
  content: string
  threadId?: string
  replyTo?: string
  attachments?: Attachment[]
  metadata?: Record<string, unknown>
}

interface SendResult {
  messageId: string
  threadId?: string
}
```

**Design rationale:** The `send()` method handles the common "reply to this conversation" case. Channel-specific capabilities (Gmail CC/BCC, Slack rich blocks, Discord embeds) are exposed as **tools via `registerTool()`**, not adapter methods. This keeps the adapter interface stable across channels while giving each channel full platform-specific power through the tool system.

**Poll vs. Subscribe:** Polling adapters are called on a configurable timer. Subscribing adapters push into the same inbound queue via callback. The daemon's message processing pipeline is the same for both. Crash recovery: polling adapters re-poll from the last checkpoint; subscribing adapters re-call `connect()` then `subscribe()`. Runtime validation ensures each adapter implements at least one ingress method.

**Error signaling:** `poll()` returns a `PollResult` discriminated union instead of a raw message array. This lets adapters signal rate limiting (with `retryAfterMs` for per-channel backoff), expired OAuth tokens (triggering re-auth flow via the existing credential system), and connection loss. The `auth_expired` error code connects to the UI through the same `connectionStatus` pattern that sources already use, surfacing "Slack needs re-authentication" without daemon-specific UI code. Subscribing adapters signal errors via a second callback parameter on `subscribe()` or by calling `disconnect()` and relying on the daemon's reconnection logic.

### Session Model

**Per-channel sessions with compaction.** One CraftAgent session per active channel. The Slack channel session accumulates Slack context; the Gmail session accumulates email context. Sessions compact when they approach context limits, preserving the recent window.

This avoids NanoClaw's per-message amnesia (no context retention) and the Headless Multiplexer's single-session bottleneck (context overflow from all channels).

**Idle management:** Channels with no inbound messages for a configurable timeout (default: 30 minutes) have their CraftAgent session torn down and state persisted. The session is recreated on the next inbound message. This differs from interactive sessions in the Electron UI, which stay alive as long as the tab is open. Idle management keeps resource consumption proportional to actual channel activity rather than enabled channel count.

**Compaction considerations:** Daemon sessions have a different message shape than interactive sessions. Interactive sessions alternate user/assistant turns. Daemon sessions contain inbound channel messages and agent responses with interleaved tool calls. Generic token-based compaction works for v0.7.0. Channel-aware compaction (e.g., "summarize the last 50 Slack messages as a group") is a v0.7.x improvement that can be added without changing the plugin interface.

Fallback: if per-channel sessions prove too resource-heavy, the daemon can downgrade to stateless per-message processing without changing the plugin interface.

### Permission Model

**New `daemon` permission mode.** Whitelist-based, non-interactive. The daemon never prompts the user for approval, but restricts tool access to an explicit allowlist.

Implementation: Add `'daemon'` to the `PermissionMode` type union. Define `DAEMON_MODE_CONFIG` with:
- **Allowed tools:** Only tools registered by plugins via `registerTool()`, plus safe read-only tools
- **Blocked tools:** Bash, Write, Edit, MultiEdit, NotebookEdit (all filesystem-modifying tools)
- **No bash patterns:** Daemon sessions do not execute bash commands
- **No MCP tools:** Unless explicitly allowlisted in `daemon-permissions.json`

Configuration stored at `~/.kata-agents/workspaces/{id}/daemon-permissions.json` using the existing `PermissionsConfigSchema` Zod schema.

**Permission merge strategy:** The daemon permission model uses a separate resolution path from interactive sessions. The current permissions system merges workspace and source configs additively (more permissive). Daemon permissions use the opposite strategy: `DAEMON_BASE_PERMISSIONS` (minimal allowlist hardcoded in code) merged with `daemon-permissions.json` (user-specified allowlist additions). Workspace-level permissions are ignored entirely for daemon sessions. This prevents a permissive workspace config from accidentally granting daemon sessions Bash or filesystem access.

**Implementation notes:**
- `'daemon'` is added to `PermissionMode` type union but excluded from `PERMISSION_MODE_ORDER` (not user-cyclable via SHIFT+TAB)
- `PERMISSION_MODE_CONFIG` gets a `daemon` entry for UI status display (showing daemon session state in the app) but it does not appear in the interactive mode picker
- The PreToolUse hook in CraftAgent already checks the active mode, so enforcement requires only a new code path for `'daemon'` mode that checks against the daemon-specific allowlist

### Daemon Process Model

The daemon runs as a Bun subprocess spawned by the Electron main process. Communication via stdout/stderr JSON lines (same pattern as agent session events). The daemon starts when the app starts and stops when it stops.

**SQLite usage:** Message queue and task scheduling stored in `~/.kata-agents/workspaces/{id}/daemon.db` using `bun:sqlite`. Only the daemon process writes to SQLite. Electron queries daemon state via IPC to the daemon process, not by reading SQLite directly. This avoids cross-runtime concurrent SQLite access.

**Workspace scope:** One daemon instance per active workspace. Channels are workspace-local. Switching workspaces stops the old daemon and starts a new one. This follows Kata's existing workspace-scoped convention.

### Plugin Discovery and Loading

First-party plugins only for v0.7.0. Plugins are bundled in `packages/shared/src/daemon/plugins/` with manifest files. Third-party plugin discovery (scanning filesystem directories, npm packages) deferred to v0.8.0+.

Plugin lifecycle:
1. Daemon loads workspace config to determine enabled plugins
2. For each enabled plugin, `import()` the entry module
3. Call `plugin.register(api)` to collect channels, tools, and services
4. Start all registered services
5. Connect all registered channels
6. Begin message processing loop

Enable/disable stored in workspace `config.json` under a `daemon.plugins` key.

## File Structure

```
packages/shared/src/daemon/
  index.ts              # Daemon entry point and event loop
  types.ts              # KataPlugin, ChannelAdapter, InboundMessage types
  plugin-loader.ts      # Discovery, validation, and loading of plugins
  plugin-registry.ts    # Runtime registry of loaded channels, tools, services
  message-queue.ts      # SQLite-backed inbound/outbound message queue
  scheduler.ts          # Cron/interval task scheduling (ported from NanoClaw)
  session-manager.ts    # Per-channel CraftAgent session lifecycle
  plugins/
    slack/              # First-party Slack adapter
    gmail/              # First-party Gmail adapter

apps/electron/src/main/
  daemon-manager.ts     # Spawn/manage daemon subprocess, IPC bridge
```

## Eliminated Proposals

| Proposal | Reason for Elimination |
|----------|----------------------|
| 1. Source-Native Plugin | Data flow inversion: sources flow into agents, channels initiate agents. No structural overlap with existing Source types. |
| 4. Headless Multiplexer | Single-agent context overflow within hours. Cross-channel serialization creates unacceptable latency. |
| 5. launchd Daemon | Correct for v1.0, wrong for v0.7.0. Cross-platform daemon management and Unix socket protocol are scope that doesn't validate the channel adapter model. |

## Retained for Future Consideration

| Proposal | Future Version | What to Take |
|----------|---------------|--------------|
| 2. SQLite Queue | v0.7.0 (integrated) | SQLite for message queue already incorporated into the recommendation. GroupQueue concurrency pattern useful but needs rewrite for CraftAgent lifecycle (not a port). |
| 5. launchd Daemon | v1.0 | Independent daemon lifecycle, Unix socket IPC, and `packages/daemon/` package boundary are the right architecture when "always-on even when app is closed" becomes a requirement. |
| 6. Progressive Hybrid | v0.7.0 (merged) | Shipping strategy (first-party plugins only, closed ecosystem) merged into Proposal 3's architecture. |

## Key Risks

1. **Plugin isolation:** All plugins run in-process. A crashing plugin takes down the daemon. Acceptable for first-party plugins in v0.7.0. Blocks third-party plugin ecosystem until isolation is addressed (worker threads or subprocess per plugin in v0.9.0+).

2. **Channel adapter generality:** The poll/subscribe split covers known v0.7.0 channels but untested against future platforms. The `metadata: Record<string, unknown>` escape hatch provides flexibility at the cost of type safety.

3. **Per-channel session cost:** Each active channel maintains a CraftAgent session, consuming API context. With 4 channels active, that's 4 concurrent sessions plus any interactive sessions the user has open. Cost and rate limit implications need monitoring.

4. **Daemon permission security:** The `daemon` permission mode is a new security boundary. If misconfigured, the daemon could be overly permissive. Default should be maximally restrictive with explicit opt-in for additional tools.

## Estimated Scope

| Component | Effort |
|-----------|--------|
| Plugin types and loader | 3-4 days |
| Plugin registry | 2-3 days |
| SQLite message queue | 3-4 days |
| Daemon event loop | 3-4 days |
| Per-channel session manager | 3-4 days |
| Daemon permission mode | 2-3 days |
| Electron daemon-manager + IPC | 3-4 days |
| Slack adapter (first) | 4-5 days |
| Gmail adapter (second) | 4-5 days |
| **Total** | **~5-6 weeks** |
