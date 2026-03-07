# Phase 17 Research: End-to-End Message Processing

## Standard Stack

| Component | Technology | Confidence |
|-----------|-----------|------------|
| Message queue | `bun:sqlite` via existing `MessageQueue` class | HIGH |
| Agent execution | `CraftAgent.chat()` via `SessionManager` in Electron main process | HIGH |
| Outbound Slack | `@slack/web-api` `WebClient.chat.postMessage()` | HIGH |
| Outbound WhatsApp | `@whiskeysockets/baileys` `sendMessage()` | HIGH |
| Concurrency control | In-process semaphore (counter + queue) in daemon entry | HIGH |
| IPC protocol | JSON-lines over stdin/stdout (existing `formatMessage`/`createLineParser`) | HIGH |
| Session persistence | JSONL via existing `createSession()` in `packages/shared/src/sessions/storage.ts` | HIGH |
| Session resolution | Existing `resolveSessionKey()` in `packages/shared/src/channels/session-resolver.ts` | HIGH |

No new dependencies required. All libraries are already in the project.

## Architecture Patterns

### Pattern 1: Message Consumer Loop in Daemon

The daemon subprocess (`entry.ts`) runs a polling loop that periodically calls `queue.dequeue('inbound')`. When a message is found, it sends a `process_message` command (new IPC event type) to the Electron main process via stdout. The main process handles agent execution and returns the result.

**Why daemon polls, main process executes:**
- `SessionManager` lives in the Electron main process and manages all agent lifecycle (sources, MCP servers, permissions, credentials, persistence)
- CraftAgent requires the full Electron environment (credentials, config, OAuth)
- The daemon subprocess cannot instantiate CraftAgent directly (no access to credential manager, no IPC to renderer)
- This matches the existing architecture: daemon handles ingress/egress, main process handles agent execution

**Consumer flow:**
```
Daemon                           Main Process (Electron)
  |                                    |
  |-- dequeue('inbound') ------------> |
  |   (finds pending message)         |
  |                                    |
  |-- emit({type:'process_message',   |
  |     messageId, channelId,         |
  |     workspaceId, sessionKey,      |
  |     payload}) ------------------> |
  |                                    |
  |                                    |-- createSession() or findSession()
  |                                    |-- sendMessage(sessionId, content)
  |                                    |-- collect agent response text
  |                                    |
  |  <-- sendCommand({type:           |
  |       'message_processed',        |
  |       messageId, response}) ------|
  |                                    |
  |-- queue.markProcessed(id)          |
  |-- enqueue('outbound', response)    |
  |-- deliver to adapter               |
```

### Pattern 2: DaemonEvent/DaemonCommand Extension

Add new discriminated union variants to existing types:

**New DaemonEvent variant** (daemon -> main):
```typescript
| {
    type: 'process_message';
    messageId: number;
    channelId: string;
    workspaceId: string;
    sessionKey: string;
    content: string;
    metadata: Record<string, unknown>;
  }
```

**New DaemonCommand variant** (main -> daemon):
```typescript
| {
    type: 'message_processed';
    messageId: number;
    response: string;
    success: boolean;
    error?: string;
  }
```

### Pattern 3: Session Creation for Channel Messages

The main process creates or reuses sessions for daemon messages:

1. Look up session by `sessionKey` (the deterministic hash from `resolveSessionKey`)
2. If no session exists, call `SessionManager.createSession(workspaceId, { channel: { adapter, slug, displayName }, permissionMode: 'daemon' })`
3. If session exists, reuse it for conversation continuity
4. Call `SessionManager.sendMessage(sessionId, content)` and collect the final assistant text
5. Return the response text to daemon

**Session lookup by sessionKey:** The `sessionKey` format is `daemon-{channelSlug}-{hash12}`. Use the existing `listSessions()` + filter by `channel.slug` and matching session name/id pattern, or add a `sessionKey` field to `SessionConfig` for direct lookup.

### Pattern 4: Outbound Delivery via Adapter

The `ChannelAdapter` interface needs a `send()` method for outbound messages:

```typescript
interface ChannelAdapter {
  // existing...
  send?(message: OutboundMessage): Promise<void>;
}

interface OutboundMessage {
  channelId: string;    // platform-specific channel/conversation ID
  content: string;      // message text
  threadId?: string;    // reply to specific thread
  metadata?: Record<string, unknown>;
}
```

For Slack: `WebClient.chat.postMessage({ channel, text, thread_ts })`. The WebClient instance already exists in `SlackChannelAdapter` (created during `configure()`).

For WhatsApp: `sock.sendMessage(jid, { text })`. The socket instance already exists in `WhatsAppChannelAdapter`.

### Pattern 5: Concurrency Control via Semaphore

Cap concurrent daemon sessions at a configurable limit (default: 3). Use an in-process semaphore in the daemon's message consumer:

```typescript
class Semaphore {
  private current = 0;
  private waiting: (() => void)[] = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }

  release(): void {
    this.current--;
    const next = this.waiting.shift();
    if (next) {
      this.current++;
      next();
    }
  }
}
```

The semaphore gates `process_message` emissions. The daemon dequeues messages freely but only sends them for processing when a slot is available. Messages wait in-memory until a slot opens.

### Pattern 6: Response Collection in Main Process

`SessionManager.sendMessage()` is designed for UI event streaming. For daemon messages, the main process needs to collect the final assistant text without sending events to the renderer.

Two approaches:

**A) Add a `sendMessageHeadless()` method** that runs `CraftAgent.chat()` in a simplified loop, collecting `text_complete` events and returning the final text. No IPC events to renderer. This is the cleaner approach.

**B) Intercept events from existing `sendMessage()`** by temporarily registering a collector callback. More fragile and couples to the event stream format.

Approach A is recommended. The method would:
1. Get or create agent (reusing `getOrCreateAgent`)
2. Call `agent.chat(message)`
3. Iterate the async generator, collecting `text_complete` events
4. Return the concatenated final (non-intermediate) text
5. Persist session state

## Don't Hand-Roll

| Problem | Use Instead |
|---------|------------|
| Message queue | Existing `MessageQueue` class (SQLite-backed, atomic dequeue) |
| Session ID resolution | Existing `resolveSessionKey()` |
| Session persistence | Existing `createSession()` / `saveSession()` in sessions/storage |
| IPC framing | Existing `createLineParser()` / `formatMessage()` |
| Agent execution | Existing `CraftAgent.chat()` async generator |
| Credential resolution | Existing flow in `channel-config-delivery.ts` |
| Adapter creation | Existing `PluginManager.getAdapterFactory()` |
| Polling state | Existing `MessageQueue.getPollingState()` / `setPollingState()` |

## Common Pitfalls

### P1: Daemon Cannot Run CraftAgent Directly

**Risk:** HIGH

The daemon subprocess runs as a standalone Bun process. CraftAgent requires:
- CredentialManager (reads encrypted credentials)
- Config from `~/.kata-agents/config.json`
- OAuth token refresh
- MCP server connections
- Renderer IPC for permission requests

Attempting to instantiate CraftAgent in the daemon would fail because the credential manager, config loader, and renderer IPC are all in the Electron main process.

**Mitigation:** Agent execution stays in the main process. The daemon's role is ingress/egress only. The daemon sends `process_message` events; the main process handles agent execution and returns results via `message_processed` commands.

### P2: Blocking the Daemon Event Loop

**Risk:** MEDIUM

The daemon's stdin reader is a single async loop. If agent execution were synchronous or blocking, the daemon would stop reading commands and health checks would fail.

**Mitigation:** The consumer loop runs on a timer (`setInterval`), separate from the stdin reader. `process_message` events are fire-and-forget from the daemon's perspective. The response comes back asynchronously via the `message_processed` command.

### P3: Self-Reply Loops

**Risk:** HIGH

If the agent's response is posted to a channel, the adapter will poll that message on the next cycle, creating an infinite loop: agent response -> polled as new message -> agent processes -> new response -> ...

**Mitigation:** The Slack adapter already filters bot messages by `botUserId` and `botId` (lines 102-103 of `slack-adapter.ts`). For WhatsApp, filter by `key.fromMe`. Verify these filters work for outbound messages posted by the bot token.

### P4: Race Between Dequeue and Process

**Risk:** LOW

The `MessageQueue.dequeue()` atomically sets status to `processing` via `UPDATE ... RETURNING`, so no two consumers can claim the same message. Since the daemon is single-threaded, there's only one consumer. Race conditions are structurally impossible.

**Mitigation:** No action needed. The existing atomic dequeue handles this correctly.

### P5: Stale Messages After Daemon Restart

**Risk:** MEDIUM

If the daemon crashes after dequeuing a message (status = `processing`) but before completing it, the message stays in `processing` state permanently. On restart, it's never reprocessed.

**Mitigation:** On daemon startup, reset all `processing` messages back to `pending`. Add a recovery query:
```sql
UPDATE messages SET status = 'pending'
WHERE status = 'processing'
```

### P6: Missing Outbound Context

**Risk:** MEDIUM

When the agent responds, the daemon needs to know which platform channel and thread to reply in. The inbound message payload contains `metadata.slackChannel` (for Slack) and `replyTo.threadId`, but these must be preserved through the round-trip.

**Mitigation:** Store the inbound `ChannelMessage` metadata in the queue payload. When the response comes back, read the original message's payload to extract `metadata.slackChannel`, `replyTo.threadId`, and `channelId` for routing the outbound message to the correct adapter and thread.

### P7: No `daemon` Permission Mode Yet

**Risk:** MEDIUM

The brainstorm specified a `daemon` permission mode with a tool allowlist. This mode doesn't exist yet. Without it, daemon sessions would use `safe` (read-only) or `allow-all` (dangerous for autonomous operation).

**Mitigation:** For Phase 17, use `safe` mode as the default for daemon sessions. The `daemon` permission mode with tool allowlist is a separate concern that can be added later. Using `safe` mode ensures daemon sessions can read files and answer questions but cannot modify the filesystem.

## Code Examples

### Example 1: Message Consumer Timer in Daemon Entry

```typescript
// In entry.ts, after ChannelRunner starts
const CONSUMER_INTERVAL_MS = 1000;
const MAX_CONCURRENT = 3;
let activeCount = 0;

const consumerTimer = setInterval(() => {
  while (activeCount < MAX_CONCURRENT) {
    const msg = queue.dequeue('inbound');
    if (!msg) break;

    activeCount++;
    const payload = msg.payload as ChannelMessage;

    emit({
      type: 'process_message',
      messageId: msg.id,
      channelId: msg.channelId,
      workspaceId: (payload.metadata?.workspaceId as string) ?? '',
      sessionKey: (payload.metadata?.sessionKey as string) ?? '',
      content: payload.content,
      metadata: payload.metadata,
    });
  }
}, CONSUMER_INTERVAL_MS);
```

### Example 2: Main Process Event Handler

```typescript
// In index.ts DaemonManager onEvent callback
if (event.type === 'process_message') {
  handleDaemonMessage(event, sessionManager, daemonManager).catch(err => {
    mainLog.error('[daemon] Message processing error:', err);
    daemonManager.sendCommand({
      type: 'message_processed',
      messageId: event.messageId,
      response: '',
      success: false,
      error: err.message,
    });
  });
}

async function handleDaemonMessage(
  event: ProcessMessageEvent,
  sessionManager: SessionManager,
  daemonManager: DaemonManager,
): Promise<void> {
  const response = await sessionManager.processDaemonMessage(
    event.workspaceId,
    event.sessionKey,
    event.content,
    { adapter: event.channelId, slug: event.channelId },
  );

  daemonManager.sendCommand({
    type: 'message_processed',
    messageId: event.messageId,
    response,
    success: true,
  });
}
```

### Example 3: Outbound Delivery on Slack

```typescript
// In SlackChannelAdapter
async send(message: OutboundMessage): Promise<void> {
  if (!this.client) throw new Error('Adapter not configured');

  await this.client.chat.postMessage({
    channel: message.channelId,
    text: message.content,
    thread_ts: message.threadId,
  });
}
```

### Example 4: Session Lookup by Key

```typescript
// In SessionManager
async processDaemonMessage(
  workspaceId: string,
  sessionKey: string,
  content: string,
  channelInfo: { adapter: string; slug: string },
): Promise<string> {
  const workspace = getWorkspaceByNameOrId(workspaceId);
  if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

  // Find existing session by sessionKey stored in name or metadata
  let sessionId: string | undefined;
  const sessions = listStoredSessions(workspace.rootPath);
  const existing = sessions.find(s => s.name === sessionKey);

  if (existing) {
    sessionId = existing.id;
  } else {
    // Create new session with channel attribution
    const session = await this.createSession(workspaceId, {
      permissionMode: 'safe',
      channel: { adapter: channelInfo.adapter, slug: channelInfo.slug },
    });
    sessionId = session.id;
    // Store sessionKey as session name for future lookup
    await updateSessionMetadata(workspace.rootPath, sessionId, { name: sessionKey });
  }

  // Execute agent and collect response
  return await this.sendMessageHeadless(sessionId, content);
}
```

## Integration Points

### Files to Modify

| File | Change | Confidence |
|------|--------|------------|
| `packages/core/src/types/daemon.ts` | Add `process_message` DaemonEvent and `message_processed` DaemonCommand variants | HIGH |
| `packages/shared/src/daemon/entry.ts` | Add message consumer timer, handle `message_processed` command, recovery query | HIGH |
| `packages/shared/src/channels/types.ts` | Add `send?()` method to `ChannelAdapter` interface, add `OutboundMessage` type | HIGH |
| `packages/shared/src/channels/adapters/slack-adapter.ts` | Implement `send()` using `WebClient.chat.postMessage()` | HIGH |
| `packages/shared/src/channels/adapters/whatsapp-adapter.ts` | Implement `send()` using Baileys `sendMessage()` | MEDIUM |
| `apps/electron/src/main/sessions.ts` | Add `processDaemonMessage()` and `sendMessageHeadless()` methods | HIGH |
| `apps/electron/src/main/index.ts` | Handle `process_message` events in DaemonManager onEvent callback | HIGH |
| `packages/shared/src/daemon/channel-runner.ts` | Add `deliverOutbound()` method to route responses to correct adapter | HIGH |

### Files Unchanged

| File | Reason |
|------|--------|
| `packages/shared/src/daemon/message-queue.ts` | Already has enqueue/dequeue/markProcessed/markFailed |
| `packages/shared/src/channels/session-resolver.ts` | Already produces session keys |
| `packages/shared/src/daemon/ipc.ts` | Already handles JSON-lines framing |
| `apps/electron/src/main/daemon-manager.ts` | Already relays events/commands bidirectionally |
| `apps/electron/src/main/channel-config-delivery.ts` | No changes needed for message processing |

## Open Questions

### Q1: Session Key Storage (LOW risk)

The `sessionKey` from `resolveSessionKey()` is stored in `ChannelMessage.metadata.sessionKey` by the ChannelRunner. For session lookup, we need a way to find sessions by this key. Options:

A) Store `sessionKey` as the session `name` field (simple, but overloads the display name)
B) Add a `sessionKey` field to `SessionConfig` (cleaner, requires schema change)
C) Use a Map in SessionManager memory (lost on restart)

Recommendation: Option B. Add `sessionKey?: string` to `SessionConfig`. This is a small schema addition and enables direct lookup.

### Q2: Working Directory for Daemon Sessions

Daemon-spawned sessions need a working directory for the agent. Options:

A) Use workspace default working directory
B) Use the session folder path (no filesystem context)
C) Use `none` (agent has no working dir)

Recommendation: Option A for sessions that need file access, Option C for pure conversational agents. Let the channel config specify this.
