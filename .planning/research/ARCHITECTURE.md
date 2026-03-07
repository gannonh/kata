# Architecture Research: v0.7.0 "Always-On Assistant"

**Domain:** Daemon process, plugin system, channel adapters for Electron desktop app
**Researched:** 2026-02-07
**Confidence:** HIGH (grounded in codebase analysis of current patterns)

---

## Decisions from Brainstorm (Inputs)

The following architectural decisions are already locked:

- Daemon runs as a Bun subprocess of Electron (not a WebSocket gateway)
- Plugin contract: `registerChannel` / `registerTool` / `registerService`
- Dual ingress `ChannelAdapter` (poll/subscribe)
- New `daemon` permission mode
- Per-channel CraftAgent sessions with compaction
- SQLite for daemon message queue and task scheduling
- First-party plugins only (bundled, no discovery)

This document maps HOW each decision integrates with the existing codebase.

---

## 1. Current Architecture Patterns

### 1.1 Process Model

The Electron main process (`apps/electron/src/main/index.ts`) owns the application lifecycle. It instantiates two singletons:

- `WindowManager` (line 110): manages BrowserWindow instances, tracks workspace assignment per webContents.id
- `SessionManager` (line 111): manages in-memory `ManagedSession` objects, creates `CraftAgent` instances lazily (line 1474)

The main process does NOT run agent inference directly. `CraftAgent` wraps the Claude Agent SDK, which spawns a Bun subprocess internally. The main process consumes streaming events from the SDK via `for await (const event of agent.chat())`.

### 1.2 Session Lifecycle

```
User message (IPC)
  -> SessionManager.sendMessage()
    -> getOrCreateAgent() [lazy CraftAgent construction]
    -> agent.chat(message)  [SDK spawns Bun subprocess]
    -> for-await event loop  [streaming events]
      -> sendEvent() to renderer via IPC
    -> persistSession()  [JSONL write via debounced queue]
```

Key details from `sessions.ts`:
- `ManagedSession` (line 267) holds: agent instance (nullable, lazy), messages array, processing state, message queue, permission mode, source slugs, working directory
- Sessions are workspace-scoped, persisted as JSONL at `~/.kata-agents/workspaces/{id}/sessions/{sessionId}/session.jsonl`
- Message queuing handles concurrent sends: if processing, new messages are queued and the current query is force-aborted via `AbortReason.Redirect`
- Delta batching (line 472) reduces IPC events from 50+/sec to ~20/sec by buffering text deltas at 50ms intervals

### 1.3 Source Infrastructure

Sources (`packages/shared/src/sources/`) are external data connections. Three types: `mcp`, `api`, `local`. Each produces either:
- An MCP server config (remote HTTP/SSE or local stdio subprocess)
- An in-process API server (created via `createSdkMcpServer`)

`SourceServerBuilder` (`server-builder.ts`) takes `SourceWithCredential[]` and returns `BuiltServers`:
```typescript
interface BuiltServers {
  mcpServers: Record<string, McpServerConfig>;   // keyed by source slug
  apiServers: Record<string, SdkMcpServer>;      // keyed by source slug
  errors: Array<{ sourceSlug: string; error: string }>;
}
```

Sources are workspace-scoped, stored at `~/.kata-agents/workspaces/{id}/sources/{slug}/config.json`. The `LoadedSource` type includes the full config, guide markdown, folder path, workspace ID, and icon path.

`CraftAgent` (line 355) holds `sourceMcpServers`, `sourceApiServers`, and `activeSourceServerNames` as internal state, rebuilt on each query in `getOptions()`.

### 1.4 Permission System

Three modes defined in `mode-types.ts`: `safe` (read-only), `ask` (prompt for writes), `allow-all` (auto-approve). Mode state is per-session, managed by `initializeModeState()` in `mode-manager.ts`. The mode drives PreToolUse hook behavior in `CraftAgent`.

### 1.5 Config Watcher

`ConfigWatcher` (`packages/shared/src/config/watcher.ts`) provides file-system watching with callbacks for: source changes, guide changes, status config changes, label changes, theme changes, skill changes, session metadata changes. SessionManager creates one watcher per workspace (line 508).

### 1.6 HeadlessRunner

`HeadlessRunner` (`packages/shared/src/headless/runner.ts`) provides non-interactive execution. It creates a `CraftAgent` with `isHeadless: true`, maps a permission policy to a `PermissionMode`, and runs `agent.chat()` as an async generator. This is the closest existing primitive to daemon-initiated sessions.

### 1.7 IPC Pattern

All renderer communication goes through `IPC_CHANNELS` (defined in `apps/electron/src/shared/types.ts`, line 470). Handlers are registered in `ipc.ts`. Events flow main-to-renderer via `sendEvent()` on SessionManager, which calls `window.webContents.send()` on all windows matching the workspace.

---

## 2. Integration Points for the Daemon Manager

### 2.1 Where DaemonManager Lives

**Location:** `apps/electron/src/main/daemon.ts` (NEW)

The daemon is a long-lived manager in the Electron main process, parallel to `SessionManager`. It does not replace SessionManager; it creates and manages daemon-specific sessions through it.

```
apps/electron/src/main/
  index.ts          # App lifecycle, creates DaemonManager
  sessions.ts       # SessionManager (unchanged API, new daemon session type)
  daemon.ts         # DaemonManager (NEW)
  ipc.ts            # IPC handlers (add daemon channels)
  window-manager.ts # WindowManager (unchanged)
```

**Initialization sequence** (in `index.ts` `app.whenReady()`):
1. Create WindowManager (existing)
2. Create SessionManager (existing)
3. Create DaemonManager, pass SessionManager reference
4. Register IPC handlers (existing, extended with daemon channels)
5. DaemonManager.start() - loads plugins, starts channel polling

**Shutdown sequence** (in `app.on('before-quit')`):
1. DaemonManager.stop() - drain queue, stop polling, close SQLite
2. SessionManager cleanup (existing)
3. WindowManager cleanup (existing)

### 2.2 DaemonManager Responsibilities

```typescript
class DaemonManager {
  private sessionManager: SessionManager;
  private pluginRegistry: PluginRegistry;
  private messageQueue: DaemonMessageQueue;   // SQLite-backed
  private taskScheduler: TaskScheduler;        // SQLite-backed
  private activeChannelSessions: Map<string, string>; // channelId -> sessionId

  constructor(sessionManager: SessionManager) { ... }

  async start(): Promise<void> {
    await this.loadPlugins();
    await this.messageQueue.initialize();
    await this.startChannelPolling();
  }

  async stop(): Promise<void> {
    await this.drainQueue();
    await this.stopChannelPolling();
    await this.messageQueue.close();
  }

  // Called by channel adapters when messages arrive
  async onChannelMessage(channelId: string, message: ChannelMessage): Promise<void> {
    await this.messageQueue.enqueue(channelId, message);
    await this.processQueue();
  }
}
```

### 2.3 Relationship to SessionManager

DaemonManager uses SessionManager's public API to create and manage sessions. Daemon sessions are regular sessions with additional metadata:

```typescript
// In sessions.ts, extend ManagedSession
interface ManagedSession {
  // ... existing fields ...
  isDaemonSession?: boolean;
  channelId?: string;
  channelName?: string;
}
```

DaemonManager calls `sessionManager.createSession()` and `sessionManager.sendMessage()` just like the IPC handler does. The key difference: daemon sessions use the new `daemon` permission mode instead of user-selected modes.

**Why reuse SessionManager:** Session persistence, event broadcasting to renderer, message queuing, and agent lifecycle are already solved. Daemon sessions appear in the session list alongside user sessions, giving full audit trail visibility.

### 2.4 Daemon Permission Mode

Add `'daemon'` to the `PermissionMode` union:

```typescript
// mode-types.ts
export type PermissionMode = 'safe' | 'ask' | 'allow-all' | 'daemon';
```

`daemon` mode behaves like `ask` with auto-approval for a configurable allowlist (defined per plugin). The mode manager already supports per-session state (`initializeModeState` takes a mode parameter), so no structural changes needed.

**Integration in mode-manager.ts:**
- Add `daemon` to `PERMISSION_MODE_ORDER` (or keep it separate, since users don't cycle to it)
- Add `PERMISSION_MODE_CONFIG['daemon']` with display name, color, icon
- `shouldAllowToolInMode()` checks a daemon-specific allowlist when mode is `daemon`

---

## 3. Channel Adapters and Source Infrastructure

### 3.1 How Channels Relate to Sources

Channel adapters are NOT sources. They share credential infrastructure but serve different purposes:

| Concern | Sources | Channel Adapters |
|---------|---------|-----------------|
| Direction | Agent calls external tools | External events push into agent |
| Lifecycle | Per-session, created on demand | Per-daemon, always running |
| Auth | OAuth/bearer per source | Reuses source credentials |
| Storage | `sources/{slug}/config.json` | `channels/{slug}/config.json` (NEW) |

Channel adapters consume from the same OAuth tokens as sources. For example, a Gmail channel adapter uses the same Google OAuth credential as the Gmail API source (`source_oauth::{workspaceId}::gmail`).

### 3.2 ChannelAdapter Interface

**Location:** `packages/shared/src/channels/types.ts` (NEW)

```typescript
interface ChannelAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: 'poll' | 'subscribe';

  // Lifecycle
  start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void>;
  stop(): Promise<void>;

  // Health
  isHealthy(): boolean;
  getLastError(): string | null;
}

interface ChannelMessage {
  id: string;
  channelId: string;
  source: string;        // e.g., "gmail", "slack", "github"
  timestamp: number;
  content: string;
  metadata: Record<string, unknown>;
  // For reply routing
  replyTo?: {
    threadId: string;
    messageId: string;
  };
}

interface ChannelConfig {
  slug: string;
  enabled: boolean;
  adapter: string;       // adapter type (e.g., "gmail-poll", "slack-subscribe")
  pollIntervalMs?: number;
  credentials: {
    sourceSlug: string;  // reference to existing source for auth
  };
  filter?: ChannelFilter;
}
```

### 3.3 Credential Sharing with Sources

The `SourceCredentialManager` (`packages/shared/src/sources/credential-manager.ts`) already provides:
- `getToken(source)` - loads OAuth token
- `getApiCredential(source)` - loads API key/header
- `refresh(source)` - refreshes expired OAuth tokens
- `isExpired(cred)` / `needsRefresh(cred)` - token freshness checks

Channel adapters reference a source slug in their config. The DaemonManager resolves credentials through the existing credential manager:

```typescript
// In DaemonManager
async getChannelCredentials(channelConfig: ChannelConfig): Promise<string | null> {
  const source = loadSource(this.workspaceRootPath, channelConfig.credentials.sourceSlug);
  if (!source) return null;
  const credManager = getSourceCredentialManager();
  return credManager.getToken(source);
}
```

This avoids duplicating credential storage and leverages existing OAuth refresh flows.

### 3.4 Channel Storage

**Location:** `~/.kata-agents/workspaces/{id}/channels/{slug}/config.json`

Following the source storage pattern (`packages/shared/src/sources/storage.ts`):
- One folder per channel with a `config.json`
- Workspace-scoped (parallel to `sources/`, `sessions/`, `skills/`)
- CRUD functions: `loadChannelConfig`, `saveChannelConfig`, `loadWorkspaceChannels`

**New workspace subdirectory:** Add `channels/` alongside existing `sources/`, `sessions/`, `skills/`, `statuses/`, `labels/`.

---

## 4. Plugin Types and Registry

### 4.1 Package Location

**Location:** `packages/shared/src/plugins/` (NEW)

Plugins define types and registration logic. They live in `packages/shared` because:
- Plugin types are needed by both the daemon (main process) and potentially UI (to display plugin status)
- Follows the pattern of `sources/`, `sessions/`, `agent/` being in `packages/shared`
- Plugin implementations (first-party) ship as bundled code, not as separate packages

### 4.2 Plugin Contract

```typescript
// packages/shared/src/plugins/types.ts
interface KataPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  // Registration hooks
  registerChannels?(registry: ChannelRegistry): void;
  registerTools?(registry: ToolRegistry): void;
  registerServices?(registry: ServiceRegistry): void;

  // Lifecycle
  initialize?(context: PluginContext): Promise<void>;
  shutdown?(): Promise<void>;
}

interface ChannelRegistry {
  addAdapter(id: string, factory: () => ChannelAdapter): void;
}

interface ToolRegistry {
  addTool(tool: SdkTool): void;  // Uses existing SDK tool() helper
}

interface ServiceRegistry {
  addService(id: string, service: PluginService): void;
}

interface PluginContext {
  workspaceRootPath: string;
  getCredential: (sourceSlug: string) => Promise<string | null>;
  logger: PluginLogger;
}
```

### 4.3 Plugin Registry

```typescript
// packages/shared/src/plugins/registry.ts
class PluginRegistry {
  private plugins: Map<string, KataPlugin> = new Map();
  private channelAdapters: Map<string, () => ChannelAdapter> = new Map();
  private tools: SdkTool[] = [];
  private services: Map<string, PluginService> = new Map();

  register(plugin: KataPlugin): void { ... }
  getChannelAdapter(id: string): ChannelAdapter | null { ... }
  getTools(): SdkTool[] { ... }
}
```

### 4.4 First-Party Plugin Structure

Bundled plugins live alongside shared code:

```
packages/shared/src/plugins/
  types.ts              # Plugin contract interfaces
  registry.ts           # PluginRegistry class
  index.ts              # Exports
  builtin/              # First-party plugins
    gmail/
      index.ts          # KataPlugin implementation
      gmail-adapter.ts  # ChannelAdapter for Gmail polling
    slack/
      index.ts
      slack-adapter.ts  # ChannelAdapter for Slack WebSocket
    github/
      index.ts
      github-adapter.ts # ChannelAdapter for GitHub webhooks/polling
```

Each plugin is `import`-ed by the DaemonManager at startup. No dynamic discovery, no file-system scanning.

---

## 5. Data Flow Changes

### 5.1 Inbound Message Flow (Channel -> Agent)

```
Channel Adapter (poll/subscribe)
  -> DaemonManager.onChannelMessage()
    -> SQLite message queue (enqueue)
    -> processQueue()
      -> find or create daemon session for this channel
      -> SessionManager.sendMessage(sessionId, formattedMessage)
        -> CraftAgent.chat()  [existing flow]
        -> streaming events -> IPC -> renderer
      -> on complete: check for reply action
        -> Channel Adapter.sendReply() (if applicable)
      -> SQLite message queue (dequeue / mark processed)
```

### 5.2 Per-Channel Sessions

Each channel gets a dedicated CraftAgent session. This maps to the existing `ManagedSession` model. The session persists across messages from the same channel, enabling conversation continuity.

**Session ID convention:** `daemon-{channelSlug}-{workspaceId}`

**Compaction:** Long-running daemon sessions will hit context limits. The SDK's built-in compaction handles this. The `pendingPlanExecution` / `markCompactionComplete` pattern in `sessions/storage.ts` already supports post-compaction recovery. Daemon sessions can reuse this.

### 5.3 SQLite Integration

**Location:** `~/.kata-agents/daemon.db` (NEW, global not workspace-scoped)

Tables:
- `message_queue`: pending messages from channel adapters
- `task_schedule`: cron-style scheduled triggers
- `channel_state`: last poll cursor, subscription state per channel

SQLite runs in the Electron main process. Bun has built-in SQLite support (`bun:sqlite`), but the main process runs in Node.js (Electron). Use `better-sqlite3` (synchronous, no native compilation issues with Electron).

**Why global not workspace-scoped:** The daemon manages channels across workspaces. A single SQLite database avoids coordination between multiple DB files.

### 5.4 IPC Extensions

New channels for daemon management:

```typescript
// In IPC_CHANNELS (apps/electron/src/shared/types.ts)
export const IPC_CHANNELS = {
  // ... existing ...

  // Daemon management
  DAEMON_STATUS: 'daemon:status',
  DAEMON_START: 'daemon:start',
  DAEMON_STOP: 'daemon:stop',

  // Channel management
  CHANNEL_LIST: 'channels:list',
  CHANNEL_CREATE: 'channels:create',
  CHANNEL_UPDATE: 'channels:update',
  CHANNEL_DELETE: 'channels:delete',
  CHANNEL_TEST: 'channels:test',

  // Daemon events (main -> renderer)
  DAEMON_EVENT: 'daemon:event',
  CHANNEL_MESSAGE: 'channel:message',
}
```

### 5.5 Renderer Awareness

Daemon sessions appear in the session list. The renderer needs:
- A daemon status indicator (running/stopped/error)
- Channel management UI (list, add, configure, test)
- Daemon session filtering/grouping in the session sidebar
- A way to distinguish daemon sessions visually (icon, badge, or section)

State management follows existing Jotai patterns:
```
atoms/daemon.ts (NEW)
  daemonStatusAtom: 'running' | 'stopped' | 'error'
  channelsAtom: ChannelConfig[]
```

---

## 6. Build Order

Based on dependency analysis of the existing codebase, ordered by what unblocks the next step.

### Phase 1: Foundation Types and SQLite (no runtime changes)

**Files:**
- `packages/shared/src/plugins/types.ts` - Plugin, ChannelAdapter, ChannelMessage interfaces
- `packages/shared/src/plugins/registry.ts` - PluginRegistry class
- `packages/shared/src/plugins/index.ts` - Exports
- `packages/shared/src/channels/types.ts` - ChannelConfig, ChannelFilter
- `packages/shared/src/channels/storage.ts` - CRUD for channel configs
- `packages/shared/src/channels/index.ts` - Exports
- `packages/core/src/types/daemon.ts` - DaemonEvent, DaemonStatus types
- `packages/shared/src/agent/mode-types.ts` - Add 'daemon' to PermissionMode

**Why first:** All subsequent phases import these types. Pure types, no runtime behavior. Can be merged independently and tested with unit tests.

**Dependencies:** None. Uses existing patterns from `sources/types.ts` and `sources/storage.ts`.

### Phase 2: Daemon Permission Mode

**Files:**
- `packages/shared/src/agent/mode-types.ts` - PERMISSION_MODE_CONFIG for daemon
- `packages/shared/src/agent/mode-manager.ts` - shouldAllowToolInMode for daemon mode
- `packages/shared/src/agent/permissions-config.ts` - daemon-specific allowlist support

**Why second:** The daemon needs a permission mode before it can run any agents. Small surface area, testable in isolation.

**Dependencies:** Phase 1 types.

### Phase 3: SQLite Message Queue and Task Scheduler

**Files:**
- `apps/electron/src/main/daemon-db.ts` (NEW) - SQLite schema, queue operations
- Test: queue enqueue/dequeue, scheduled task retrieval

**Why third:** The queue is the daemon's central state. Must work before channel adapters can push into it.

**Dependencies:** Phase 1 types. Uses `better-sqlite3`.

### Phase 4: DaemonManager Core

**Files:**
- `apps/electron/src/main/daemon.ts` (NEW) - DaemonManager class
- `apps/electron/src/main/index.ts` - Instantiate and lifecycle-manage DaemonManager
- `apps/electron/src/main/ipc.ts` - Add DAEMON_STATUS, DAEMON_START, DAEMON_STOP handlers
- `apps/electron/src/shared/types.ts` - Add daemon IPC channels

**Why fourth:** This is the orchestrator. It connects the queue to SessionManager. Can be tested with a mock channel adapter that enqueues synthetic messages.

**Dependencies:** Phases 1-3.

### Phase 5: First Channel Adapter (Gmail Polling)

**Files:**
- `packages/shared/src/plugins/builtin/gmail/index.ts` - Plugin registration
- `packages/shared/src/plugins/builtin/gmail/gmail-adapter.ts` - Poll adapter using Gmail API
- Channel config storage integration
- Credential sharing with existing Gmail source

**Why Gmail first:** Gmail API source already exists in the codebase (Google OAuth flow, API tools). The credential infrastructure is proven. Polling is simpler than WebSocket subscription.

**Dependencies:** Phases 1-4 plus existing Gmail source in workspace.

### Phase 6: Renderer Integration

**Files:**
- `apps/electron/src/renderer/atoms/daemon.ts` (NEW) - Jotai atoms
- `apps/electron/src/renderer/hooks/useDaemon.ts` (NEW)
- `apps/electron/src/preload/index.ts` - Expose daemon IPC
- Daemon status indicator component
- Channel management UI
- Daemon session visual distinction in sidebar

**Why sixth:** The daemon can run headlessly before any UI exists. UI is important for usability but not for validating the core architecture.

**Dependencies:** Phase 4 (daemon IPC).

### Phase 7: Additional Channel Adapters

**Files:**
- `packages/shared/src/plugins/builtin/slack/` - WebSocket subscription adapter
- `packages/shared/src/plugins/builtin/github/` - Webhook/polling adapter

**Why last:** Each adapter is independent. Gmail proves the pattern, additional adapters follow it.

**Dependencies:** Phases 1-5 pattern established.

---

## 7. Risk Assessment

### 7.1 Main Process Load

The Electron main process is already doing work: IPC handling, session management, config watching, git watching. Adding a daemon with polling loops and SQLite operations increases load.

**Mitigation:** Polling intervals should be configurable and conservative (60s minimum for email, 30s for Slack). SQLite operations are synchronous but fast for queue operations. Monitor main process event loop lag.

### 7.2 Concurrent CraftAgent Sessions

The daemon creates persistent CraftAgent sessions per channel. Each agent holds MCP server connections and state. With 5 channels, that's 5 concurrent agent instances plus any user-initiated sessions.

**Mitigation:** Daemon sessions are created lazily (only when a message arrives). Inactive sessions can be reaped after a timeout, with the SDK session ID preserved for resumption. The existing `getOrCreateAgent()` pattern in SessionManager handles this.

### 7.3 Credential Lifecycle

Channel adapters run continuously. OAuth tokens expire. The existing `SourceCredentialManager.refresh()` handles token refresh, but it's designed for per-request use. A long-running polling loop needs proactive refresh.

**Mitigation:** Before each poll cycle, check `needsRefresh(cred)` and refresh if needed. This is the same pattern used in `buildServersFromSources()` (sessions.ts, line 104-130) where `getTokenForSource` returns a function that refreshes on each call.

### 7.4 SQLite in Electron

Electron's main process runs Node.js, not Bun. `better-sqlite3` works with Electron but requires native compilation. Electron-builder handles this with `rebuild`.

**Mitigation:** Use `better-sqlite3` which is well-tested with Electron. Add to electron-builder config for native module rebuilding. Test on all platforms (macOS, Windows, Linux).

---

## 8. What Does NOT Change

These existing systems remain untouched:

- **CraftAgent API** - `chat()`, `forceAbort()`, `setSourceServers()` interfaces unchanged
- **SessionManager public API** - `createSession()`, `sendMessage()`, `deleteSession()` unchanged
- **Source storage** - `sources/{slug}/config.json` unchanged
- **Session JSONL format** - same header + messages structure
- **Credential storage** - `credentials.enc` file format unchanged
- **IPC event format** - `SESSION_EVENT` carries the same `SessionEvent` types
- **Renderer event processor** - consumes the same events, renders daemon sessions identically

The v0.7.0 architecture is additive. Every new component (DaemonManager, PluginRegistry, ChannelAdapter, SQLite queue) composes with existing primitives rather than replacing them.

---

## 9. Package Export Changes

### packages/shared/package.json

Add subpath exports:
```json
{
  "./plugins": "./src/plugins/index.ts",
  "./channels": "./src/channels/index.ts"
}
```

### packages/core/src/types/

Add `daemon.ts` with daemon event types, re-export from `index.ts`.

---

## 10. File Inventory

| File | Status | Package | Purpose |
|------|--------|---------|---------|
| `packages/shared/src/plugins/types.ts` | NEW | shared | Plugin contract interfaces |
| `packages/shared/src/plugins/registry.ts` | NEW | shared | PluginRegistry class |
| `packages/shared/src/plugins/index.ts` | NEW | shared | Package exports |
| `packages/shared/src/plugins/builtin/gmail/` | NEW | shared | Gmail channel adapter plugin |
| `packages/shared/src/plugins/builtin/slack/` | NEW | shared | Slack channel adapter plugin |
| `packages/shared/src/plugins/builtin/github/` | NEW | shared | GitHub channel adapter plugin |
| `packages/shared/src/channels/types.ts` | NEW | shared | Channel config types |
| `packages/shared/src/channels/storage.ts` | NEW | shared | Channel CRUD |
| `packages/shared/src/channels/index.ts` | NEW | shared | Package exports |
| `packages/core/src/types/daemon.ts` | NEW | core | Daemon event types |
| `packages/core/src/types/index.ts` | MODIFY | core | Re-export daemon types |
| `packages/shared/src/agent/mode-types.ts` | MODIFY | shared | Add 'daemon' permission mode |
| `packages/shared/src/agent/mode-manager.ts` | MODIFY | shared | Daemon mode tool filtering |
| `apps/electron/src/main/daemon.ts` | NEW | electron | DaemonManager class |
| `apps/electron/src/main/daemon-db.ts` | NEW | electron | SQLite schema and operations |
| `apps/electron/src/main/index.ts` | MODIFY | electron | DaemonManager lifecycle |
| `apps/electron/src/main/ipc.ts` | MODIFY | electron | Daemon/channel IPC handlers |
| `apps/electron/src/main/sessions.ts` | MODIFY | electron | ManagedSession daemon fields |
| `apps/electron/src/shared/types.ts` | MODIFY | electron | IPC channels, daemon types |
| `apps/electron/src/preload/index.ts` | MODIFY | electron | Expose daemon IPC |
| `apps/electron/src/renderer/atoms/daemon.ts` | NEW | electron | Jotai daemon state |
| `apps/electron/src/renderer/hooks/useDaemon.ts` | NEW | electron | Daemon React hook |

---

## Sources

All findings based on reading the actual codebase at `/Users/gannonhall/dev/kata/kata-agents/`:

- `apps/electron/src/main/sessions.ts` - SessionManager, ManagedSession, agent lifecycle
- `apps/electron/src/main/ipc.ts` - IPC handler patterns, file validation
- `apps/electron/src/main/index.ts` - App lifecycle, singleton instantiation
- `apps/electron/src/main/window-manager.ts` - Window management patterns
- `apps/electron/src/shared/types.ts` - IPC_CHANNELS, type re-exports
- `packages/shared/src/agent/craft-agent.ts` - CraftAgent class, source management
- `packages/shared/src/agent/mode-types.ts` - PermissionMode, mode config
- `packages/shared/src/agent/mode-manager.ts` - Per-session mode state
- `packages/shared/src/agent/index.ts` - Agent package exports
- `packages/shared/src/sources/types.ts` - LoadedSource, FolderSourceConfig
- `packages/shared/src/sources/storage.ts` - Source CRUD patterns
- `packages/shared/src/sources/server-builder.ts` - MCP/API server building
- `packages/shared/src/sources/credential-manager.ts` - OAuth token management
- `packages/shared/src/sources/index.ts` - Source package exports
- `packages/shared/src/mcp/client.ts` - CraftMcpClient transport handling
- `packages/shared/src/sessions/types.ts` - SessionConfig, SessionHeader
- `packages/shared/src/sessions/storage.ts` - Session CRUD, JSONL format
- `packages/shared/src/headless/runner.ts` - HeadlessRunner pattern
- `packages/shared/src/headless/types.ts` - HeadlessConfig, HeadlessResult
- `packages/core/src/types/session.ts` - Core session types
- `.planning/brainstorms/radical-report.md` - Reactive Workspace Agents proposal
- `.planning/brainstorms/SUMMARY.md` - Feature brainstorm synthesis
