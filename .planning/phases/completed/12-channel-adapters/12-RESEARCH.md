# Phase 12: Channel Adapters - Research

**Researched:** 2026-02-07
**Domain:** Slack and WhatsApp channel adapter implementation, thread-to-session mapping, trigger pattern matching
**Confidence:** MEDIUM (Slack HIGH, WhatsApp LOW due to Bun compatibility risk)

## Summary

Phase 12 implements two channel adapters (Slack and WhatsApp) that integrate with the daemon core from Phase 11 and the plugin/channel type contracts from Phase 10. The adapters receive external messages, filter them by configurable trigger patterns, map conversation threads to persistent daemon sessions, and enqueue messages into the SQLite queue for agent processing.

Slack is straightforward: `@slack/web-api` v7.13.0 is stable, well-documented, and its `conversations.history` polling pattern with `oldest` timestamp is the standard approach. The main consideration is rate limits (Tier 3 for custom/Marketplace apps: 50+ req/min, but dropping to Tier 1 for non-Marketplace commercial apps in March 2026).

WhatsApp via Baileys carries significant risk. Baileys (v7.0.0-rc.9, still in release candidate) uses the `ws` WebSocket library, and Bun does not implement `ws.WebSocket` `upgrade` and `unexpected-response` events. This causes connection failures. Since the daemon runs as a Bun subprocess, **Baileys will not work under Bun without a workaround.** The options are: (1) run the WhatsApp adapter in a Node.js child process instead of directly in the Bun daemon, (2) wait for Bun to implement the missing ws events, or (3) defer WhatsApp to a later phase.

**Primary recommendation:** Implement Slack adapter first (low risk, clear API). Defer or prototype WhatsApp adapter with explicit Bun compatibility validation before committing to Baileys.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| `@slack/web-api` | 7.13.0 | Slack API client | Official Slack SDK, built-in rate limit handling, TypeScript types |
| `@whiskeysockets/baileys` | 7.0.0-rc.9 | WhatsApp Web API | Only maintained WhatsApp Web library for Node.js/TS |

### Supporting

| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| `@hapi/boom` | 10.x | HTTP error types | Required by Baileys for disconnect reason codes |
| `pino` | 9.x | Structured logging | Required by Baileys constructor (can use `level: 'silent'` to suppress) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Baileys | whatsapp-web.js (puppeteer-based) | Heavier (runs Chromium), but more stable; same unofficial API risk |
| `@slack/web-api` polling | Slack Socket Mode (`@slack/socket-mode`) | Real-time but requires WebSocket connection; polling is simpler for daemon model |
| `@slack/web-api` polling | Slack Events API | Requires public HTTP endpoint; unsuitable for desktop app |

**Installation:**
```bash
bun add @slack/web-api
# WhatsApp - only if Bun compatibility is resolved:
bun add @whiskeysockets/baileys @hapi/boom pino
```

## Architecture Patterns

### Recommended Project Structure

```
packages/shared/src/
├── channels/
│   ├── types.ts              # ChannelAdapter, ChannelMessage, ChannelConfig (exists)
│   ├── index.ts              # Re-exports (exists)
│   ├── session-resolver.ts   # ChannelSessionResolver - thread-to-session mapping
│   ├── trigger-matcher.ts    # TriggerMatcher - @mention, keyword matching
│   ├── adapters/
│   │   ├── slack-adapter.ts  # SlackChannelAdapter implements ChannelAdapter
│   │   ├── whatsapp-adapter.ts  # WhatsAppChannelAdapter implements ChannelAdapter
│   │   └── index.ts          # Adapter factory/registry
│   └── __tests__/
│       ├── slack-adapter.test.ts
│       ├── whatsapp-adapter.test.ts
│       ├── session-resolver.test.ts
│       └── trigger-matcher.test.ts
├── daemon/
│   ├── entry.ts              # Enhanced to load channel adapters (modify existing)
│   └── channel-runner.ts     # Orchestrates adapter lifecycle within daemon
├── plugins/
│   └── kata-slack.ts         # KataPlugin implementation for Slack
│   └── kata-whatsapp.ts      # KataPlugin implementation for WhatsApp
```

### Pattern 1: Poll Adapter (Slack)

**What:** Timer-driven polling loop that fetches new messages since last known timestamp.
**When to use:** Slack, any HTTP-based API with history endpoint.

```typescript
// Source: @slack/web-api Context7 docs + Slack API docs
import { WebClient } from '@slack/web-api';

class SlackChannelAdapter implements ChannelAdapter {
  readonly type = 'poll';
  private client: WebClient | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastTimestamps: Map<string, string> = new Map(); // channelId -> latest ts
  private healthy = true;
  private lastError: string | null = null;

  async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    const token = /* resolve from config.credentials.sourceSlug */;
    this.client = new WebClient(token, {
      retryConfig: { retries: 3 }
    });

    const intervalMs = config.pollIntervalMs ?? 10_000;
    this.pollTimer = setInterval(() => this.poll(config, onMessage), intervalMs);
    // Initial poll immediately
    await this.poll(config, onMessage);
  }

  private async poll(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    const channelIds = config.filter?.channelIds ?? [];
    for (const channelId of channelIds) {
      const oldest = this.lastTimestamps.get(channelId);
      const result = await this.client!.conversations.history({
        channel: channelId,
        oldest,         // Only messages after this timestamp
        inclusive: false, // Exclude the oldest message itself
        limit: 100,
      });

      for (const msg of result.messages ?? []) {
        if (msg.bot_id) continue; // Skip bot messages (prevents self-reply loops)
        const channelMessage = this.toChannelMessage(channelId, msg);
        onMessage(channelMessage);
      }

      // Track latest timestamp for next poll
      if (result.messages?.length) {
        this.lastTimestamps.set(channelId, result.messages[0].ts!);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.client = null;
  }
}
```

### Pattern 2: Subscribe Adapter (WhatsApp)

**What:** Persistent WebSocket connection with event-driven message ingestion.
**When to use:** WhatsApp, Discord, any real-time protocol.

```typescript
// Source: Baileys Context7 docs
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  getContentType
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';

class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly type = 'subscribe';
  private sock: ReturnType<typeof makeWASocket> | null = null;
  private healthy = false;

  async start(config: ChannelConfig, onMessage: (msg: ChannelMessage) => void): Promise<void> {
    const authPath = /* resolve from workspace config */;
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const logger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false, // Desktop app handles QR differently
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          // Reconnect
          this.start(config, onMessage);
        }
      }
      if (connection === 'open') this.healthy = true;
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const channelMessage = this.toChannelMessage(msg);
        onMessage(channelMessage);
      }
    });

    this.sock.ev.on('creds.update', saveCreds);
  }
}
```

### Pattern 3: ChannelSessionResolver

**What:** Deterministic mapping from channel thread identifiers to daemon session IDs.
**When to use:** Every channel adapter uses this to maintain conversation continuity.

```typescript
class ChannelSessionResolver {
  /**
   * Derive a stable session key from channel + thread context.
   * Format: daemon-{channelSlug}-{workspaceId}-{threadKey}
   */
  resolveSessionKey(
    channelSlug: string,
    workspaceId: string,
    threadId: string | undefined,
    channelSourceId: string // e.g. Slack channel ID
  ): string {
    const threadKey = threadId ?? channelSourceId; // No thread = channel-level session
    // Hash for reasonable length
    const hash = createHash('sha256')
      .update(`${channelSlug}:${workspaceId}:${threadKey}`)
      .digest('hex')
      .slice(0, 12);
    return `daemon-${channelSlug}-${hash}`;
  }
}
```

### Pattern 4: TriggerMatcher

**What:** Evaluates whether a message should activate the agent based on configurable patterns.
**When to use:** Filtering inbound messages before enqueuing.

```typescript
class TriggerMatcher {
  private patterns: RegExp[];

  constructor(triggerPatterns: string[]) {
    this.patterns = triggerPatterns.map(p => new RegExp(p, 'i'));
  }

  matches(content: string): boolean {
    if (this.patterns.length === 0) return true; // No filter = match all
    return this.patterns.some(p => p.test(content));
  }
}
```

### Anti-Patterns to Avoid

- **Polling without `oldest` tracking:** Fetching full history on every poll wastes API quota and reprocesses messages.
- **Storing Slack bot tokens in source credentials as user tokens:** Bot tokens (xoxb-) and user tokens (xoxp-) have different scopes and behaviors. The existing Slack OAuth flow produces user tokens; the channel adapter needs bot tokens.
- **Reconnecting Baileys without backoff:** Rapid reconnection loops can get the WhatsApp number temporarily banned.
- **Processing bot's own messages:** Both Slack and WhatsApp adapters must filter out messages sent by the bot itself to prevent infinite reply loops.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Slack API rate limiting | Custom retry/backoff | `@slack/web-api` built-in retry | WebClient has configurable retry with automatic rate limit handling via `retryConfig` and `Retry-After` header parsing |
| WhatsApp auth state | Custom credential serialization | `useMultiFileAuthState` from Baileys | Handles Signal protocol key management, session state, multi-device auth |
| Slack message pagination | Manual cursor tracking | `conversations.history` pagination params | API handles cursor-based pagination natively |
| Thread-to-session ID mapping | Ad-hoc string concatenation | Dedicated `ChannelSessionResolver` with hash | Prevents session key collisions and keeps IDs at consistent lengths |
| Regex trigger matching | Inline pattern checks | `TriggerMatcher` class | Centralizes pattern compilation, handles empty-pattern-means-match-all |

**Key insight:** The Slack WebClient already handles rate limiting, retries, and pagination. The main custom logic is the polling loop, trigger matching, and session resolution.

## Common Pitfalls

### Pitfall 1: Baileys + Bun WebSocket Incompatibility

**What goes wrong:** Baileys uses the `ws` npm package for WebSocket connections. Bun's `ws` compatibility layer does not implement `upgrade` and `unexpected-response` events, causing `Connection Terminated` errors.
**Why it happens:** Bun provides a native WebSocket API but its `ws` polyfill is incomplete for these specific events that Baileys relies on.
**How to avoid:** Either (a) run the WhatsApp adapter as a Node.js child process spawned from the Bun daemon, (b) wait for Bun to ship full ws compatibility, or (c) defer WhatsApp.
**Warning signs:** `ws.WebSocket 'upgrade' event is not implemented in bun` warning at startup, immediate connection failure.

### Pitfall 2: Slack Rate Limit Changes (March 2026)

**What goes wrong:** Non-Marketplace commercial apps will be rate-limited to 1 request/minute with max 15 objects starting March 3, 2026.
**Why it happens:** Slack changed their rate limit tiers. Custom workspace apps maintain Tier 3 (50+ req/min), but commercially distributed non-Marketplace apps drop to Tier 1.
**How to avoid:** For Kata Agents (a desktop app users install to their own workspace), this is a "custom app" and retains Tier 3 limits. Document that users should create their own Slack app (custom install) rather than using a distributed app.
**Warning signs:** `slack_webapi_rate_limited` errors, `retryAfter` values in error responses.

### Pitfall 3: Self-Reply Infinite Loops

**What goes wrong:** Agent sends a message to the channel. Next poll picks it up. Agent processes it and replies again. Infinite loop.
**Why it happens:** The adapter processes all messages, including those sent by the bot itself.
**How to avoid:** Filter messages by `bot_id` (Slack) or `key.fromMe` (WhatsApp). Store the bot's own user ID at adapter startup (via `auth.test` in Slack).
**Warning signs:** Rapidly growing message count in a channel, agent responding to its own messages.

### Pitfall 4: Slack Bot Token vs User Token Confusion

**What goes wrong:** Using the existing Slack OAuth flow (which produces user tokens, xoxp-) for the channel adapter, resulting in messages posted as the user rather than the bot.
**Why it happens:** The existing `slack-oauth.ts` uses `user_scope` and produces user tokens. Channel adapters need bot tokens (xoxb-) to post as the app.
**How to avoid:** The channel adapter needs a separate credential path: a Slack Bot Token stored via the channel config. Users configure this by creating a Slack App and providing the bot token. Do NOT reuse the existing Source OAuth flow for channel adapter auth.
**Warning signs:** Messages appearing as the user who installed the app, not as the bot.

### Pitfall 5: Thread Context Loss Across Restarts

**What goes wrong:** After daemon restart, the adapter loses track of `lastTimestamps` and either re-processes old messages or misses messages received during downtime.
**Why it happens:** Polling state (last known timestamp per channel) is stored in memory only.
**How to avoid:** Persist `lastTimestamps` to SQLite (daemon.db) or a separate state table. On startup, load last known timestamps and resume from there ("sleep/wake catch-up").
**Warning signs:** Duplicate message processing after restart, missed messages during downtime.

### Pitfall 6: WhatsApp QR Code in Headless Context

**What goes wrong:** Baileys needs QR code scanning for initial authentication. The daemon runs headless.
**Why it happens:** WhatsApp requires phone scanning of a QR code for first-time pairing.
**How to avoid:** The QR code must be surfaced to the UI. Options: (a) emit QR data as a DaemonEvent and render in Electron renderer, (b) require initial pairing through a dedicated setup flow in the UI before enabling the channel.
**Warning signs:** Adapter stuck in "connecting" state, no QR visible to user.

## Code Examples

### Slack: Posting a threaded reply

```typescript
// Source: @slack/web-api Context7, conversations.replies docs
await client.chat.postMessage({
  channel: 'C1234567890',
  text: agentResponse,
  thread_ts: originalMessage.ts, // Reply in thread
});
```

### Slack: Identifying bot's own messages

```typescript
// Source: Slack API docs (auth.test)
const authResult = await client.auth.test();
const botUserId = authResult.user_id;
const botId = authResult.bot_id;

// In poll loop, skip own messages:
for (const msg of result.messages ?? []) {
  if (msg.bot_id === botId || msg.user === botUserId) continue;
  // Process message...
}
```

### Slack: Polling with oldest timestamp

```typescript
// Source: Slack conversations.history API docs
const result = await client.conversations.history({
  channel: channelId,
  oldest: lastKnownTimestamp, // Unix timestamp string, e.g. "1678886400.123456"
  inclusive: false,           // Don't include the oldest message itself
  limit: 100,
});
// Messages are returned newest-first; reverse for chronological processing
const chronological = [...(result.messages ?? [])].reverse();
```

### Enqueuing into daemon MessageQueue

```typescript
// Source: existing codebase (packages/shared/src/daemon/message-queue.ts)
const channelMessage: ChannelMessage = {
  id: msg.ts!,
  channelId: adapter.id,
  source: msg.user!,
  timestamp: parseFloat(msg.ts!) * 1000,
  content: msg.text ?? '',
  metadata: { channel: slackChannelId, team: msg.team },
  replyTo: msg.thread_ts ? {
    threadId: msg.thread_ts,
    messageId: msg.ts!,
  } : undefined,
};

queue.enqueue('inbound', adapter.id, channelMessage);
```

### ChannelConfig storage path

```typescript
// Source: existing ChannelConfig type (packages/shared/src/channels/types.ts)
// Stored at: ~/.kata-agents/workspaces/{id}/channels/{slug}/config.json
const channelConfigPath = join(
  workspaceRootPath, 'channels', channelSlug, 'config.json'
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Slack RTM API | Slack Web API + polling or Socket Mode | RTM deprecated 2021 | Must use `@slack/web-api`, not `@slack/rtm-api` |
| Baileys v4-v6 (stable) | Baileys v7.0.0-rc (release candidate) | 2025-2026 | Breaking changes in auth, connection handling |
| Slack Tier 3 for all apps | Tier 1 for non-Marketplace commercial apps | March 2026 | Custom apps unaffected; distributed apps severely limited |
| Baileys runs on Node.js | Baileys needs Node.js, Bun `ws` events incomplete | Ongoing | WhatsApp adapter may require Node.js child process |

**Deprecated/outdated:**
- `@slack/rtm-api`: Deprecated, do not use. Use `@slack/web-api` with polling.
- Baileys `@adiwajshing/baileys`: Unmaintained. Use `@whiskeysockets/baileys`.
- Slack `channels.history` / `groups.history`: Legacy methods. Use `conversations.history`.

## Open Questions

1. **Baileys Bun Compatibility**
   - What we know: Bun's `ws` polyfill lacks `upgrade` and `unexpected-response` events. Baileys fails at connection time.
   - What's unclear: Whether Bun v1.2+ resolves this. Whether a Node.js child process for WhatsApp is acceptable architecturally.
   - Recommendation: Test Baileys under current Bun version first. If it fails, implement WhatsApp adapter to spawn as a Node.js child process OR defer to a later phase.

2. **Slack Bot Token Provisioning**
   - What we know: Existing OAuth produces user tokens (xoxp-). Channel adapter needs bot tokens (xoxb-).
   - What's unclear: Whether to (a) extend the existing Slack OAuth to also request bot scopes, (b) have users manually enter a bot token, or (c) build a separate bot-focused OAuth flow.
   - Recommendation: Start with manual bot token entry via channel config. A bot OAuth flow can be added later. This avoids the HTTPS relay dependency (which is currently blocking Slack OAuth entirely per `SLACK_OAUTH_DISABLED = true`).

3. **Daemon Entry Point Enhancement**
   - What we know: Current `daemon/entry.ts` creates the MessageQueue but has no channel adapter lifecycle management.
   - What's unclear: How the daemon discovers which channel adapters to start. Whether ChannelConfig is read directly by the daemon or sent via IPC command.
   - Recommendation: Daemon reads channel configs from `~/.kata-agents/workspaces/{id}/channels/*/config.json` at startup. New DaemonCommand variant (`configure_channels`) enables IPC-driven config updates.

4. **Outbound Message Flow**
   - What we know: MessageQueue supports `outbound` direction. ChannelAdapter has no `send()` method in the current type.
   - What's unclear: How agent responses flow back through the adapter to the external platform.
   - Recommendation: Add `sendMessage(channelId: string, content: string, replyTo?: { threadId: string }): Promise<void>` to ChannelAdapter. The daemon dequeues outbound messages and routes them to the appropriate adapter.

5. **Concurrent Session Cap**
   - What we know: Brainstorm specified 3-5 concurrent daemon-triggered agent sessions.
   - What's unclear: How this interacts with the existing SessionManager in the Electron main process, since daemon sessions run in the Bun subprocess.
   - Recommendation: Implement a simple semaphore in the daemon's channel-runner that limits concurrent CraftAgent invocations.

## Sources

### Primary (HIGH confidence)
- `/slackapi/node-slack-sdk` (Context7) - WebClient setup, conversations.history params, chat.postMessage, thread handling
- `/whiskeysockets/baileys` (Context7) - makeWASocket, useMultiFileAuthState, messages.upsert event, connection handling
- Existing codebase: `packages/shared/src/channels/types.ts`, `packages/shared/src/daemon/`, `packages/shared/src/plugins/types.ts`

### Secondary (MEDIUM confidence)
- [Slack Rate Limits docs](https://docs.slack.dev/apis/web-api/rate-limits/) - Tier 3 for custom apps, rate limit change timeline
- [Slack conversations.history docs](https://docs.slack.dev/reference/methods/conversations.history/) - oldest/latest params, pagination
- [Slack conversations.replies docs](https://docs.slack.dev/reference/methods/conversations.replies/) - thread_ts threading model
- [Slack rate limit changes for non-Marketplace apps](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/) - March 2026 deadline
- [Baileys npm](https://www.npmjs.com/package/@whiskeysockets/baileys) - v7.0.0-rc.9, still RC

### Tertiary (LOW confidence)
- [Bun ws upgrade event issue #5951](https://github.com/oven-sh/bun/issues/5951) - WebSocket incompatibility (may be resolved in future Bun versions)
- [Baileys Connection Terminated in Bun #5287](https://github.com/oven-sh/bun/issues/5287) - Confirms Baileys fails under Bun
- [Baileys GitHub Issues](https://github.com/WhiskeySockets/Baileys/issues) - 141 open issues, ongoing stability work

## Metadata

**Confidence breakdown:**
- Standard stack (Slack): HIGH - Official SDK, stable, well-documented
- Standard stack (WhatsApp): LOW - Baileys is RC, Bun incompatibility confirmed
- Architecture: HIGH - Builds on existing Phase 10/11 types and daemon infrastructure
- Pitfalls: HIGH - Well-documented rate limits, known Bun issues, clear filtering requirements
- Thread mapping: MEDIUM - ChannelSessionResolver pattern is sound but session lifecycle needs design

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (30 days; Baileys compatibility may change faster)
