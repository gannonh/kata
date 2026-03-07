# Technology Stack

**Project:** Kata Agents v0.7.0 - Always-On Assistant (Daemon, Channels, Plugin System)
**Researched:** 2026-02-07

## New Dependencies

### Channel SDK Libraries

| Package | Version | Purpose | Bun Compatible | Ingress Model |
|---------|---------|---------|----------------|---------------|
| @slack/web-api | ^7.13.0 | Slack REST API (post messages, read history) | Yes (since Bun 1.1.10) | Poll |
| @slack/socket-mode | ^2.0.5 | Slack real-time events via WebSocket | Yes (since Bun 1.1.10) | Subscribe |
| discord.js | ^14.25.1 | Discord gateway + REST (messages, events) | Yes (official Bun guide exists) | Subscribe |
| @whiskeysockets/baileys | ^7.0.0-rc.9 | WhatsApp Web API via WebSocket | Likely (uses ws + crypto, no native deps) | Subscribe |
| googleapis | ^171.4.0 | Gmail API (messages.list, history.list) | Yes (pure HTTP client) | Poll |

### Supporting Libraries (Transitive, Already Present or Pulled In)

| Package | Pulled By | Notes |
|---------|-----------|-------|
| @hapi/boom | baileys | Error handling, peer dep |
| pino | baileys | Logger, peer dep (can pass silent logger) |
| ws | discord.js, baileys | WebSocket client, Bun has native ws support |

### What NOT to Add

| Library | Why Not |
|---------|---------|
| @slack/bolt | Framework-level abstraction; we only need web-api + socket-mode for channel adapter |
| @google-cloud/pubsub | Requires GCP project + webhook endpoint; desktop app uses polling instead |
| @googleapis/gmail | Subpackage of googleapis; full googleapis package gives access to all Google APIs |
| node-cron | Bun has `setInterval`; daemon scheduler is ~50 lines with SQLite-backed next_run |

## Detailed Library Analysis

### @slack/web-api + @slack/socket-mode

**Version verified:** 7.13.0 (web-api), 2.0.5 (socket-mode) on npm.

**Bun compatibility:** Resolved. Issue [slackapi/node-slack-sdk#1748](https://github.com/slackapi/node-slack-sdk/issues/1748) was closed May 2024 after Bun 1.1.10 added brotli compression support. No workarounds needed.

**Architecture decision: Poll vs Socket Mode.**
The brainstorm specifies Slack uses HTTP polling via `conversations.history`. Socket Mode is available as an alternative (WebSocket-based, no public URL needed). For v0.7.0:

- **Use @slack/web-api only.** Poll `conversations.history` on a 2s interval. Simpler. One fewer dependency (@slack/socket-mode can be deferred).
- Socket Mode requires an app-level token (xapp-*) in addition to the bot token (xoxb-*). The existing Kata OAuth flow produces bot tokens. Adding app-level tokens requires Slack app manifest changes.
- Socket Mode is worth adding in a later release for reduced latency and lower API rate limit consumption.

**Minimal integration surface:**
```typescript
import { WebClient } from '@slack/web-api'

const client = new WebClient(botToken)

// Poll for new messages
const result = await client.conversations.history({
  channel: channelId,
  oldest: lastTimestamp,  // Only messages after this
  limit: 20,
})

// Send response
await client.chat.postMessage({
  channel: channelId,
  text: responseText,
  thread_ts: threadTs,  // Reply in thread
})
```

**Rate limits:** `conversations.history` allows ~50 calls/min (Tier 3). At 2s polling, that is 30 calls/min per channel. One channel is fine; multiple channels on the same workspace may need staggered polling.

### discord.js

**Version verified:** 14.25.1 on npm. Stable v14 line (Discord API v10).

**Bun compatibility:** Confirmed working. Bun's official docs include a [discord.js guide](https://bun.com/docs/guides/ecosystem/discordjs). One known limitation: `@discordjs/voice` (native opus bindings) does not work in Bun. Not relevant for text-based channel adapter.

**Ingress model:** Subscribe. discord.js maintains a persistent WebSocket connection to the Discord Gateway. Messages arrive as `messageCreate` events with no polling needed.

**Intents required:**
```typescript
import { Client, GatewayIntentBits } from 'discord.js'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,  // Privileged intent
  ]
})

client.on('messageCreate', (message) => {
  // message.content, message.author, message.channelId
  // message.reply(text) to respond
})

await client.login(botToken)
```

**Privileged intents note:** `MessageContent` is a privileged intent. Bots in fewer than 100 guilds can enable it in the Discord Developer Portal without verification. Bots in 100+ guilds require Discord approval. This is a user-facing setup step, not a code concern.

**Resource footprint:** discord.js Client holds one WebSocket + in-memory cache of guilds, channels, members. Memory usage scales with guild size. For a single-guild bot typical of Kata's use case, expect ~20-40MB overhead.

### @whiskeysockets/baileys

**Version verified:** 7.0.0-rc.9 on npm (release candidate). The v7 line is the actively maintained branch.

**Bun compatibility:** Not explicitly tested by the Baileys team, but the library is pure TypeScript over `ws` (WebSocket) and `libsignal-protocol-typescript`. No native Node.js addons. Community projects (baileys-api, whatsapp-mcp-ts) use Baileys with Bun-based toolchains.

**Risk: RC status.** v7 is a release candidate. The API surface may shift before stable release. Pin to an exact version (7.0.0-rc.9) and track releases. The v6 line (6.7.9) is stable but receives fewer updates.

**Risk: Reverse-engineered protocol.** Baileys is not an official WhatsApp API. WhatsApp can change its protocol at any time, breaking Baileys. The brainstorm report flags this as a known risk. Mitigation: treat WhatsApp as a best-effort channel, surface connection errors in the UI, and degrade gracefully.

**Auth model:** QR code pairing. Baileys generates a QR code that the user scans with their phone. Auth state persists to disk via `useMultiFileAuthState()`. After initial pairing, reconnection is automatic.

**Integration for Kata:** The QR code flow needs UI integration. Options:
1. Render QR in the Electron renderer via IPC (daemon sends QR data to main process, main process forwards to renderer).
2. Open a temporary window with the QR code.

**Minimal integration surface:**
```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'

const { state, saveCreds } = await useMultiFileAuthState(authDir)

const sock = makeWASocket({
  auth: state,
  printQRInTerminal: false,  // We handle QR via UI
})

sock.ev.on('connection.update', ({ connection, qr }) => {
  if (qr) sendQrToElectron(qr)  // Forward QR to UI
  if (connection === 'open') onConnected()
  if (connection === 'close') handleReconnect()
})

sock.ev.on('messages.upsert', ({ messages, type }) => {
  if (type !== 'notify') return
  for (const msg of messages) {
    onMessage(normalizeMessage(msg))
  }
})

sock.ev.on('creds.update', saveCreds)
```

**Auth state storage:** `useMultiFileAuthState` writes to a directory. For Kata, store under the source folder: `~/.kata-agents/workspaces/{id}/sources/{slug}/whatsapp-auth/`. This aligns with existing per-source storage patterns.

### googleapis (Gmail)

**Version verified:** 171.4.0 on npm.

**Bun compatibility:** Yes. Pure HTTP client wrapping Google's REST APIs. No native dependencies.

**Existing infrastructure:** Kata already has Google OAuth with Gmail scopes (`gmail.modify`, `gmail.compose`) in `packages/shared/src/auth/google-oauth.ts`. The OAuth tokens are stored via the existing credential manager. No new auth flow needed.

**Ingress model: Poll with historyId.** Gmail push notifications require Google Cloud Pub/Sub with a webhook endpoint, which is not available in a desktop app. The recommended approach for desktop apps is polling via `users.history.list()` with a stored `historyId`.

**Polling pattern:**
```typescript
import { google } from 'googleapis'

const gmail = google.gmail({ version: 'v1', auth: oauthClient })

// Initial: get current historyId
const profile = await gmail.users.getProfile({ userId: 'me' })
let lastHistoryId = profile.data.historyId

// Poll: get changes since last check
const history = await gmail.users.history.list({
  userId: 'me',
  startHistoryId: lastHistoryId,
  historyTypes: ['messageAdded'],
  labelIds: [labelId],  // Optional: filter by label
})

if (history.data.history) {
  for (const entry of history.data.history) {
    for (const added of entry.messagesAdded || []) {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: added.message.id,
        format: 'full',
      })
      onMessage(normalizeGmailMessage(msg.data))
    }
  }
  lastHistoryId = history.data.historyId
}
```

**Poll interval:** 30-60s is appropriate for email. Gmail API quota is 250 units/user/second; `history.list` costs 2 units. No rate limit concern at 60s intervals.

**Package size note:** `googleapis` is large (~80MB installed) because it bundles type definitions for all Google APIs. Alternative: use `@googleapis/gmail` (^15.0.0) for a smaller footprint (~2MB). Trade-off: if Kata later adds Calendar or Drive channels, separate subpackages would need to be installed. Recommendation: start with `@googleapis/gmail` for v0.7.0. Switch to full `googleapis` only if multiple Google services are needed.

## SQLite: bun:sqlite vs better-sqlite3

### Architecture Context

The brainstorm establishes:
- Daemon process runs in Bun, writes to `~/.kata-agents/daemon/daemon.db`
- Electron main process (Node.js) needs read access for UI display
- WAL mode enables concurrent readers + single writer

### bun:sqlite (for daemon)

**API:** Built into Bun runtime. No dependency to install. Synchronous API inspired by better-sqlite3.

**Key API surface:**
```typescript
import { Database } from 'bun:sqlite'

const db = new Database('daemon.db')
db.run('PRAGMA journal_mode = WAL')

// Cached prepared statement
const insert = db.query('INSERT INTO messages VALUES ($id, $content)')
insert.run({ $id: '1', $content: 'hello' })

// Fetch rows
const rows = db.query('SELECT * FROM messages WHERE processed = 0').all()

// Transactions
const tx = db.transaction((msgs) => {
  for (const m of msgs) insert.run(m)
})
tx(messages)  // Atomic
```

**Performance:** Bun claims 3-6x faster than better-sqlite3 for read queries. The advantage comes from JavaScriptCore's native integration, bypassing N-API overhead. For the daemon's workload (small tables, low throughput), the difference is negligible. The real advantage is zero dependencies.

**Strict mode:** `new Database(path, { strict: true })` allows binding parameters without `$`/`:` prefixes and throws on missing parameters. Recommended for daemon code.

### better-sqlite3 (for Electron reads)

**Status:** Not currently in `package.json` dependencies, but referenced in the brainstorm as the reader for the Electron side.

**Consideration:** Adding better-sqlite3 to Electron requires native module rebuilding for the Electron Node.js version. This is a known pain point (electron-rebuild, node-gyp). The brainstorm acknowledges this risk and specifies a fallback.

**Recommendation: Use the IPC fallback from day one.** Instead of Electron directly reading the SQLite file via better-sqlite3:
1. Daemon exposes a query interface over stdin/stdout (part of the existing JSON protocol).
2. Electron sends query requests to the daemon; daemon reads from bun:sqlite and returns results.
3. No native module in Electron. No cross-runtime SQLite file locking concerns.

This eliminates:
- better-sqlite3 as a dependency entirely
- electron-rebuild complexity
- Cross-runtime WAL compatibility uncertainty (bun:sqlite uses a different SQLite build than better-sqlite3; WAL file format is standard but implementation details may vary)
- File locking edge cases between two processes

Trade-off: adds ~1ms latency per query (IPC round-trip). Acceptable for UI display of daemon state.

### SQLite WAL Mode: Cross-Process Safety

If the IPC approach is rejected and direct file access is needed:
- WAL mode permits simultaneous readers and a single writer across processes on the same host.
- Readers get snapshot isolation: they see the database as of the moment their read transaction started.
- The WAL file format is part of the SQLite specification, not implementation-specific. A file written by bun:sqlite's SQLite build can be read by better-sqlite3's SQLite build.
- Both processes must be on the same machine (WAL does not work over network filesystems).
- Tested extensively in production by SQLite (iOS apps, Android apps, Electron apps). The cross-runtime combination (bun:sqlite writer + better-sqlite3 reader) is less common but should work given the format is standard.

## Daemon Process Patterns

### Subprocess Spawning from Electron

Kata already spawns Bun subprocesses from Electron's Node.js main process. The pattern in `SessionManager` uses the Claude Agent SDK which internally uses `child_process.spawn` (or Bun.spawn when running under Bun). The daemon will use the same approach.

**From Electron main process (Node.js):**
```typescript
import { spawn } from 'child_process'

const daemon = spawn('bun', ['run', 'packages/daemon/src/index.ts'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, KATA_DAEMON: '1' },
})

// Line-delimited JSON protocol (same as agent subprocesses)
daemon.stdout.on('data', (chunk) => {
  for (const line of chunk.toString().split('\n')) {
    if (!line.trim()) continue
    const event = JSON.parse(line)
    handleDaemonEvent(event)
  }
})

daemon.stdin.write(JSON.stringify({ type: 'start_channel', sourceSlug: 'slack-acme' }) + '\n')
```

**Bun-native IPC alternative:** Bun supports `Bun.spawn` with an `ipc` callback for structured message passing (JSC serialization, supports structured clone types). This is more ergonomic than line-delimited JSON over stdio. However, it requires both parent and child to run under Bun. Since Electron's main process is Node.js, the IPC option is not available. stdin/stdout with line-delimited JSON is the correct choice.

### Daemon Lifecycle

**Start:** Electron spawns daemon on app launch (after auth is confirmed).
**Stop:** Electron sends SIGTERM to daemon on app quit. Daemon has 5s to clean up (disconnect adapters, flush SQLite WAL, close sockets).
**Crash recovery:** Electron monitors the daemon's exit event. On unexpected exit (non-zero code), restart with exponential backoff (1s, 2s, 4s, 8s, max 30s). After 5 consecutive crashes, stop restarting and surface error in UI.

**Tray mode (deferred to v0.8.0):** To keep the daemon running when all windows are closed:
- Listen to `window-all-closed` event, prevent `app.quit()`
- Create a system tray icon with "Show Window" and "Quit" options
- Daemon continues running; tray icon provides access
- macOS: tray appears in menu bar. Windows: system tray area.

This is deferred because the daemon in v0.7.0 lives and dies with the Electron process. Tray mode requires the headless permission model.

### Communication Protocol

Reuse the existing line-delimited JSON pattern from agent subprocesses:

**Electron -> Daemon (stdin):**
```typescript
type DaemonCommand =
  | { type: 'start_channel'; sourceSlug: string; config: ChannelSourceConfig }
  | { type: 'stop_channel'; sourceSlug: string }
  | { type: 'query'; id: string; sql: string; params?: unknown[] }
  | { type: 'status' }
  | { type: 'shutdown' }
```

**Daemon -> Electron (stdout):**
```typescript
type DaemonEvent =
  | { type: 'channel_connected'; sourceSlug: string }
  | { type: 'channel_disconnected'; sourceSlug: string; reason: string }
  | { type: 'channel_error'; sourceSlug: string; error: string }
  | { type: 'message_received'; sourceSlug: string; message: IncomingMessage }
  | { type: 'agent_response'; sourceSlug: string; channelId: string; content: string }
  | { type: 'query_result'; id: string; rows: unknown[] }
  | { type: 'status'; channels: ChannelStatus[] }
  | { type: 'qr_code'; sourceSlug: string; qr: string }  // WhatsApp QR
```

## Plugin Loading Patterns in Bun/TypeScript

### Context

The brainstorm specifies source-based config over a plugin SDK for v0.7.0. Channel adapters are compiled into the daemon, not dynamically loaded. The plugin loading question is about future extensibility.

### Dynamic Import Pattern

Bun supports dynamic `import()` with TypeScript files directly (no pre-compilation needed):

```typescript
// Load adapter by name
const adapterModule = await import(`./adapters/${adapterName}.ts`)
const adapter: ChannelAdapter = adapterModule.createAdapter(config)
```

**Cache busting for development:**
```typescript
const module = await import(`./adapters/${name}.ts?t=${Date.now()}`)
```

### v0.7.0: Static Registry (No Dynamic Loading)

For v0.7.0, channel adapters are a static registry:

```typescript
const ADAPTERS: Record<string, (config: ChannelSourceConfig) => ChannelAdapter> = {
  slack: (config) => new SlackAdapter(config),
  discord: (config) => new DiscordAdapter(config),
  whatsapp: (config) => new WhatsAppAdapter(config),
  gmail: (config) => new GmailAdapter(config),
}

function createAdapter(config: ChannelSourceConfig): ChannelAdapter {
  const factory = ADAPTERS[config.adapter]
  if (!factory) throw new Error(`Unknown adapter: ${config.adapter}`)
  return factory(config)
}
```

This is the right choice for v0.7.0: no discovery mechanism, no version management, no sandboxing. Four adapters do not justify a plugin system.

### Future: Plugin Contract (v0.8.0+)

When dynamic adapter loading is needed (third-party adapters, marketplace), the minimal contract:

```typescript
// Plugin manifest (package.json or adapter.json)
interface AdapterManifest {
  name: string
  version: string
  adapter: string  // 'slack' | 'discord' | custom
  entrypoint: string  // Relative path to main module
}

// Plugin entry module must export:
export function createAdapter(config: ChannelSourceConfig): ChannelAdapter

// Loading:
const manifest = JSON.parse(await Bun.file(manifestPath).text())
const mod = await import(resolve(pluginDir, manifest.entrypoint))
const adapter = mod.createAdapter(config)
```

**Sandboxing concern:** Dynamic imports run in the same process with full filesystem access. For untrusted third-party plugins, Bun Workers (Web Worker API) provide isolation. Each worker runs in a separate thread with a restricted API surface. This is a v0.8.0+ concern.

## Installation Plan

```bash
# Phase 1: Slack adapter
bun add @slack/web-api

# Phase 2: Discord adapter
bun add discord.js

# Phase 3: WhatsApp adapter
bun add @whiskeysockets/baileys@7.0.0-rc.9 @hapi/boom pino

# Phase 3 (Gmail, if included in v0.7.0):
bun add @googleapis/gmail
```

All packages install into the daemon package (`packages/daemon/package.json`), not the root or Electron package. The daemon is a Bun subprocess; its dependencies do not need to be compatible with Electron's Node.js version.

## Version Verification

| Package | Verified Version | Source | Confidence |
|---------|-----------------|--------|------------|
| @slack/web-api | 7.13.0 | [npm](https://www.npmjs.com/package/@slack/web-api) | HIGH |
| @slack/socket-mode | 2.0.5 | [npm](https://www.npmjs.com/package/@slack/socket-mode) | HIGH |
| discord.js | 14.25.1 | [npm](https://www.npmjs.com/package/discord.js) | HIGH |
| @whiskeysockets/baileys | 7.0.0-rc.9 | [npm](https://www.npmjs.com/package/@whiskeysockets/baileys) | MEDIUM (RC) |
| googleapis | 171.4.0 | [npm](https://www.npmjs.com/package/googleapis) | HIGH |
| @googleapis/gmail | 15.0.0 | [npm](https://www.npmjs.com/package/@googleapis/gmail) | HIGH |
| bun:sqlite | Built-in (Bun 1.2+) | [Bun docs](https://bun.com/docs/runtime/sqlite) | HIGH |

## Sources

- [Slack Node SDK - GitHub](https://github.com/slackapi/node-slack-sdk) - Socket Mode and Web API
- [Slack Bun compatibility issue #1748](https://github.com/slackapi/node-slack-sdk/issues/1748) - Resolved, works since Bun 1.1.10
- [discord.js docs](https://discord.js.org/docs) - v14.25.1 API reference
- [Bun discord.js guide](https://bun.com/docs/guides/ecosystem/discordjs) - Official Bun integration guide
- [Baileys GitHub](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API
- [Gmail Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push) - Push vs poll guidance
- [bun:sqlite docs](https://bun.com/docs/runtime/sqlite) - API reference, WAL mode
- [bun:sqlite Database class](https://bun.com/reference/bun/sqlite/Database) - Constructor options
- [better-sqlite3 vs bun:sqlite discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1057) - Performance comparison
- [SQLite WAL documentation](https://sqlite.org/wal.html) - Cross-process concurrency model
- [Bun IPC guide](https://bun.com/guides/process/ipc) - Subprocess communication
- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model) - Main/renderer architecture
- [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) - Background process alternative
- [Electron background daemon patterns](https://github.com/electron/electron/issues/26288) - Community discussion
- [Electron tray pattern](https://blog.stackademic.com/how-to-keep-your-electron-app-running-in-background-guide-373f9df8418d) - Keep-alive approach
