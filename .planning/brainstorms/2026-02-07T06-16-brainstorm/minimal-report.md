# Minimal Architecture Report: NanoClaw-Style Daemon for Kata Agents

## Summary

This report proposes a minimal architecture for adding an always-on daemon with channel support to Kata Agents. The approach extends existing Kata infrastructure (source management, OAuth, credential storage, agent execution) rather than building parallel systems. The design draws on NanoClaw's single-process orchestration model while discarding patterns that don't apply to Kata's desktop context.

The core architectural insight: Kata already has ~70% of the infrastructure needed. The remaining ~30% is the daemon process itself, channel adapters, and integration work (daemon health monitoring, channel error surfacing, UI for daemon status). Everything else plugs into existing systems.

## Architecture Overview

### Process Model

The daemon runs as a separate Bun subprocess spawned by the Electron main process, using the same pattern `SessionManager` already uses for agent subprocesses. For v0.7.0, the daemon lives and dies with Electron. Independence via launchd/systemd is deferred to v0.8.0 pending a permission model for headless autonomous operation.

```
Electron Main Process
  |
  |-- SessionManager (existing)
  |     |-- Agent subprocess 1 (CraftAgent, interactive)
  |     |-- Agent subprocess 2 (CraftAgent, interactive)
  |
  |-- DaemonManager (new)
        |-- Daemon subprocess (Bun)
              |-- Channel adapters (Slack, Discord, WhatsApp, Gmail)
              |-- DaemonQueue (GroupQueue port, daemon work only)
              |-- Task scheduler (cron/interval/one-shot)
              |-- SQLite (daemon-only state)
              |-- Agent subprocess 1 (CraftAgent, daemon-triggered)
              |-- Agent subprocess 2 (CraftAgent, daemon-triggered)
```

Communication between Electron and the daemon uses stdin/stdout with line-delimited JSON, reusing the pattern already established for agent subprocesses. No WebSocket gateway, no HTTP server, no file-based IPC.

### Channel Integration: Source-Based Config

Channels are not a new source type. Instead, an optional `channel` config block is added to existing `FolderSourceConfig`. A single Slack source can serve as both an API source (agent pulls data via MCP tools) and a channel source (daemon pushes incoming messages to the agent). Same credentials, same OAuth flow, no type-switch blast radius.

```typescript
// In FolderSourceConfig (packages/shared/src/sources/types.ts)
interface FolderSourceConfig {
  // ... existing fields (id, name, slug, enabled, type, mcp, api, local, etc.)

  // Optional: daemon channel configuration
  channel?: ChannelSourceConfig
}

interface ChannelSourceConfig {
  adapter: 'slack' | 'discord' | 'whatsapp' | 'gmail'

  // Adapter-specific settings
  slackChannel?: string        // Channel ID to monitor
  discordGuildId?: string      // Discord server ID
  discordChannelId?: string    // Discord channel ID
  whatsappGroupJid?: string    // WhatsApp group JID
  gmailLabel?: string          // Gmail label to monitor

  // Behavior
  triggerPattern?: string      // Regex for when to invoke agent (e.g., "^@kata")
  autoRespond?: boolean        // Respond to all messages vs trigger-only
  permissionMode?: 'safe'      // Daemon sessions default to safe mode
}
```

The daemon scans all workspace sources for the `channel` block on startup and when config changes. Existing source infrastructure handles: folder structure (`~/.kata-agents/workspaces/{id}/sources/{slug}/`), credential management (OAuth tokens, API keys), enable/disable toggle, connection status tracking, and UI for management.

### Channel Adapter Interface

A single callback-based interface handles both polling and persistent-connection channels. The adapter decides internally whether to poll or maintain a persistent connection. The daemon has one code path: call `connect()`, handle callbacks, call `send()`.

```typescript
interface ChannelAdapter {
  connect(onMessage: (msg: IncomingMessage) => void): Promise<void>
  disconnect(): Promise<void>
  send(channelId: string, content: string): Promise<void>
}

interface IncomingMessage {
  channelId: string           // Source-specific conversation ID
  senderId: string            // Sender identifier
  senderName: string          // Display name
  content: string             // Message text
  timestamp: string           // ISO 8601
  metadata?: Record<string, unknown>  // Channel-specific data
}
```

Each adapter implements `connect()` according to its channel's native paradigm:
- **Slack:** Starts an internal HTTP poll loop (2s interval) against `conversations.history`, calls `onMessage` when new messages arrive
- **Discord:** Opens a WebSocket gateway via `discord.js`, forwards `messageCreate` events to `onMessage`
- **WhatsApp:** Starts a Baileys socket, forwards `messages.upsert` events to `onMessage`
- **Gmail:** Polls `messages.list` via Google API, calls `onMessage` for new emails

The polling-vs-streaming decision is an implementation detail of each adapter, invisible to the daemon. This is simpler than maintaining two separate interfaces (PollAdapter/StreamAdapter) and avoids the daemon needing to distinguish between adapter types in its main loop.

**Adapter implementation sizes (estimated):**
- Slack: ~150 lines using `@slack/web-api`
- Discord: ~150 lines using `discord.js`
- WhatsApp: ~200 lines using `@whiskeysockets/baileys` (includes Baileys auth state management)
- Gmail: ~150 lines using Google APIs with existing OAuth

### Concurrency: DualPoolQueue

Interactive sessions (user at keyboard) and daemon-triggered sessions run in separate execution paths with no shared queue state.

```typescript
// Interactive sessions: managed by SessionManager (existing, unchanged)
// - No concurrency cap (matches current behavior)
// - Immediate execution, never queued

// Daemon sessions: managed by DaemonQueue (port of NanoClaw's GroupQueue)
// - Hard cap at DAEMON_MAX (default 3, configurable)
// - Per-conversation exclusive access (one agent per conversation)
// - Exponential backoff on failure (5s base, max 5 retries)
// - FIFO ordering across conversations
```

Total concurrent agents on system: unlimited interactive + 3 daemon = variable. Bun processes are ~30MB each. 8 concurrent processes (3 interactive + 5 daemon) uses ~240MB, acceptable on an M1 Air with 8GB RAM.

The GroupQueue (ported from NanoClaw at ~300 lines) provides: concurrency cap enforcement, per-conversation queueing, backoff/retry with exponential delay, and graceful shutdown with SIGTERM/SIGKILL escalation.

### Daemon State: SQLite

The daemon uses SQLite (via `bun:sqlite`) for its own state. Existing session persistence (JSONL) is unchanged. No migration required.

```sql
-- Channel messages (inbound/outbound)
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_slug TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  timestamp TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Scheduled tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_slug TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'interval', 'once')),
  schedule_value TEXT NOT NULL,
  next_run TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Daemon routing state
CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Database file location: `~/.kata-agents/daemon/daemon.db`. WAL mode enabled for concurrent reads from Electron (read-only via `better-sqlite3`).

### Daemon Main Loop

The daemon's core is a single Bun process with three concerns:

1. **Channel orchestration:** Manage adapter lifecycles. Poll adapters called every 2s. Stream adapters connected with callbacks. Route incoming messages to agent via DaemonQueue.
2. **Task scheduler:** Check `tasks` table every 60s. Execute due tasks via DaemonQueue. Compute next run for cron/interval tasks.
3. **Electron communication:** Read commands from stdin (start/stop channel, query status). Write events to stdout (new message, agent response, error).

Estimated daemon core: ~800-1000 lines. With 3 channel adapters (~150 lines each): ~1,500 lines total for the `packages/daemon/` package.

### Session Mapping

Each channel+conversation combination maps to a persistent Kata session. The mapping key is `{sourceSlug}:{channelId}`. A Slack channel `#general` gets one session that accumulates context across messages. Different channels, DMs, and threads each get separate sessions.

Sessions created by the daemon are stored in the workspace like any other session but tagged with `origin: 'channel'` metadata. The daemon maintains a `channelId -> sessionId` mapping in its SQLite `state` table.

In the Electron UI, channel-originated sessions appear in the sidebar with a channel icon badge (Slack logo, Discord logo, etc.). They mix with user-initiated sessions in the same list but are visually distinguishable. No separate "Channels" section for v0.7.0. The principle: channel sessions are regular sessions with extra metadata, not a parallel system.

### Prompt Construction

The daemon core includes a `buildChannelPrompt()` function (~50-80 lines) that transforms `IncomingMessage[]` into a CraftAgent-compatible prompt:

```
[Channel: #general in Slack workspace "Acme Corp"]
[New messages since last response]

Alice (2 min ago): Can you check the deploy status?
Bob (1 min ago): @kata also look at the error logs

[You are responding in this channel. Keep responses concise and conversational.]
```

A channel-specific system prompt addendum is injected alongside the workspace system prompt. This shared logic lives in `packages/daemon/src/prompt.ts`. Each adapter normalizes messages into `IncomingMessage[]`; the prompt builder is channel-agnostic.

### Resource Model

Concurrent agents x MCP servers per session determines system load. Practical upper bound for a desktop app:

| Scenario | Interactive | Daemon | MCP Sources | Total Subprocesses | Est. Memory |
|---|---|---|---|---|---|
| Light use | 1 | 2 | 2 | 7 | ~210MB |
| Moderate | 2 | 3 | 3 | 20 | ~600MB |
| Heavy | 5 | 5 | 3 | 40 | ~1.2GB |

Each CraftAgent session holds open MCP stdio subprocesses for the duration of the session. The daemon's concurrency cap (default 3) provides the primary throttle. These defaults are configurable and should be documented so users with many sources enabled understand the load implications.

## What NanoClaw Contributed

| NanoClaw Pattern | Kata Adaptation | Status |
|---|---|---|
| Single process with polling loops | Bun daemon subprocess | Adopted |
| SQLite for message storage | Daemon-only SQLite (not replacing JSONL) | Adopted (scoped) |
| GroupQueue for concurrency | DaemonQueue (daemon-only, interactive bypasses) | Adopted (refined) |
| File-based IPC | Replaced with stdin/stdout | Rejected |
| Container isolation | Not needed (CraftAgent handles agent execution) | Rejected |
| Sentinel markers for output parsing | Not needed (stdout JSON protocol) | Rejected |
| launchd service registration | Deferred to v0.8.0 | Deferred |

Key lesson from NanoClaw: the orchestration layer around agent invocation (when to invoke, how to queue, how to route results) is where the value is. The agent execution itself uses Kata's existing `CraftAgent`. NanoClaw's container-runner, sentinel parsing, and file IPC are implementation details driven by Apple Container constraints that don't apply to Kata.

## v0.7.0 Scope

### Build (priority order, phased)

**Phase 1: Foundation + Slack (validates full loop)**
1. **Daemon process** (`packages/daemon/`): Bun subprocess with stdin/stdout communication, SQLite state, adapter orchestration, task scheduler
2. **Source-based channel config**: Add `channel` block to `FolderSourceConfig`, daemon scans sources for channel configs
3. **DaemonQueue**: Port of GroupQueue scoped to daemon work, configurable cap
4. **Slack adapter**: First channel, HTTP polling, OAuth already exists. Validates: source config -> adapter -> daemon -> prompt -> CraftAgent -> response -> send
5. **Electron integration**: `DaemonManager` in main process, spawns daemon, relays status to renderer. Channel session rendering with icon badges.

**Phase 2: Discord (validates stream adapter pattern)**
6. **Discord adapter**: WebSocket-based via `discord.js`. Validates that the callback-based `connect(onMessage)` interface works for persistent-connection channels.

**Phase 3: WhatsApp (validates QR auth flow)**
7. **WhatsApp adapter**: Baileys socket with persistent auth state. Validates QR pairing UI integration with source credential system.

### Defer to v0.8.0+

- **launchd/systemd service**: Requires headless permission model (how does the agent get approval for tool use when no UI is open?)
- **JSONL-to-SQLite session migration**: Separate project, no dependency on daemon
- **Dynamic concurrency scaling**: Static cap is sufficient for v0.7.0
- **Gmail service plugin**: Service plugins (act on user's behalf) require a different interaction model from communication channels

### Effort Estimate

| Component | Estimate |
|---|---|
| Daemon core (process, loops, scheduler) | 3-4 days |
| Source config extension + channel block | 1-2 days |
| Slack adapter | 2 days |
| Discord adapter | 2 days |
| DaemonQueue (GroupQueue port) | 1 day |
| Electron DaemonManager + UI | 2-3 days |
| WhatsApp adapter + QR UI | 3-4 days |
| Testing and integration | 3-4 days |
| **Total** | **~3-4 weeks** |

## Debate Outcomes

### Concessions Made (Explorer)

1. **File-based IPC rejected.** NanoClaw uses file IPC due to Apple Container constraints. Kata has no such constraint. stdin/stdout reuses existing patterns and provides immediate delivery.
2. **SQLite scoped to daemon only.** Full JSONL-to-SQLite migration is a multi-week project with user data concerns. Not a v0.7.0 requirement.
3. **launchd deferred.** Always-on independence from Electron requires solving the headless permission problem first.
4. **Line count revised.** From "~500 lines" to "~1,500 lines with adapters." Still far less than a gateway architecture, but the original estimate excluded real work.

### Refinements Accepted (from Challenger)

1. **Channel as config block, not SourceType.** Avoids 10+ switch-point blast radius across `credential-manager.ts`, `server-builder.ts`, and `storage.ts`. A source can be both an API source and a channel source simultaneously. Orthogonal concerns, composable config.
2. **GroupQueue daemon-only.** Interactive sessions bypass the queue entirely, maintaining current UX. Two independent execution paths, no shared state.
3. **Daemon as child process in v0.7.0.** Eliminates service discovery, version mismatch, and daemon lifecycle as v0.7.0 concerns.
4. **Phased adapter rollout.** Slack first (validates full loop), Discord second (validates stream adapter), WhatsApp third (validates QR auth). Each validates a different architectural assumption.
5. **Resource model documentation.** Concurrent agents x MCP servers x system load must be explicitly documented for users.

### Final Convergence (Round 3)

The initial proposal of two adapter interfaces (PollAdapter + StreamAdapter) was proposed by the challenger and initially accepted, but both sides converged on a single callback-based `ChannelAdapter` interface in the final round. The adapter decides internally whether to poll or maintain a persistent connection. The daemon has one code path. This is simpler than two interfaces and avoids the daemon needing to know adapter internals.

Three design gaps identified by the challenger in the final round were resolved:
1. **Session mapping:** `{sourceSlug}:{channelId}` -> persistent session with `origin: 'channel'` metadata
2. **Message rendering:** Channel sessions in the same sidebar list with channel icon badges
3. **Prompt construction:** Shared `buildChannelPrompt()` function, channel-agnostic, ~50-80 lines

### Positions Held

1. **Single daemon process.** The complexity budget is spent on channel adapters, not infrastructure.
2. **Source-based config over plugin SDK.** Existing source system handles credentials, OAuth, enable/disable, folder structure. No plugin discovery, no dynamic loading, no SDK.
3. **Extend existing systems.** ~70% of the infrastructure exists. The ~30% that's new (daemon process, channel adapters, integration UI) is the irreducible minimum regardless of architecture choice.

## Risks

1. **Adapter quality determines reliability.** The daemon is only as good as its channel adapters. Baileys (WhatsApp) is a reverse-engineered library that can break when WhatsApp changes its protocol. Discord.js and @slack/web-api are official/well-maintained.
2. **Permission model gap for autonomous actions.** For v0.7.0, daemon sessions run in `safe` mode (read-only). Users can override to `ask` mode when Electron is open. This limits what the daemon can do autonomously. Full autonomous operation requires the headless permission model designed in v0.8.0.
3. **Scope creep from "communication" to "service."** Channel adapters handle receiving and sending messages. Gmail "service" integration (acting on emails, managing calendar, ordering food) is a different interaction model. The architecture should support both, but v0.7.0 should focus on communication channels only.
4. **SQLite cross-runtime access.** Daemon writes via `bun:sqlite`, Electron reads via `better-sqlite3`. WAL mode should handle this, but the combination is not widely tested. Fallback: daemon exposes a query interface over stdin/stdout, Electron delegates reads.
5. **UX integration is the real time sink.** The server-side daemon architecture is straightforward. Making it feel right in the desktop app (daemon status display, channel session rendering, error surfacing for channel-specific failures like Slack rate limits or WhatsApp auth expiry, daemon health monitoring with crash detection and restart) is where the weeks go. The effort estimate accounts for this, but UX work is harder to predict than backend work.
6. **Daemon health monitoring.** Electron needs to detect daemon crashes and restart the process. This includes: exit code handling, restart backoff, status reporting to the renderer, and graceful degradation (channels go offline but interactive sessions continue). Not architecturally complex but necessary for production reliability.
