# Domain Pitfalls: Always-On Assistant (v0.7.0)

**Domain:** Daemon process with channel adapters (Slack, Discord, WhatsApp, Gmail) in an Electron desktop app
**Researched:** 2026-02-07
**Confidence:** HIGH (verified with official docs, GitHub issues, and community post-mortems)

---

## 1. Daemon Lifecycle Pitfalls

### Pitfall 1.1: Zombie and Orphan Subprocesses on App Exit

**What goes wrong:** Kata Agents already spawns Bun subprocesses for agent sessions via `SessionManager`. Adding a daemon process (or multiple channel adapter processes) multiplies the risk of orphaned children. When Electron's main process exits uncleanly, spawned subprocesses keep running. On macOS, unreferenced child processes prevent Electron from exiting at all ([electron#34808](https://github.com/electron/electron/issues/34808)).

**Warning signs:**
- `ps aux | grep bun` shows processes from closed app instances
- Electron `will-quit` event fires but app hangs
- CPU usage persists after quitting the app
- Multiple daemon instances after restart

**Prevention:**
1. Maintain a process registry in the main process that tracks every spawned PID
2. Hook `app.on('before-quit')` and `app.on('will-quit')` to SIGTERM all registered children, then SIGKILL after a 3-second grace period
3. Write the daemon PID to disk (`~/.kata-agents/daemon.pid`); on startup, check for stale PIDs and kill them
4. Use `child.unref()` only for truly detached processes; for the daemon, keep a reference

**Phase:** Phase 1 (Daemon Core) -- must be in the initial process management design.

---

### Pitfall 1.2: macOS Sleep/Wake Breaks Long-Lived Connections

**What goes wrong:** When macOS sleeps, WebSocket connections (Slack socket mode, Discord gateway) die silently. On wake, the daemon holds dead sockets that never receive data. The Electron main process itself can crash during sleep/wake cycles, particularly with multiple displays ([electron#24135](https://github.com/electron/electron/issues/24135)).

**Warning signs:**
- Channel adapters stop receiving messages after laptop lid close/open
- No error events fire (socket appears connected but is actually dead)
- Slack `pong_timeout` in logs followed by failed reconnection ([slackapi#1652](https://github.com/slackapi/node-slack-sdk/issues/1652))
- Discord gateway `HEARTBEAT_ACK` stops arriving

**Prevention:**
1. Listen for Electron's `powerMonitor.on('resume')` event and force-reconnect all channel adapters
2. Implement heartbeat health checks independent of SDK-level pings (e.g., if no message received in 5 minutes, probe the connection)
3. Set `powerMonitor.on('suspend')` to gracefully close connections before sleep
4. Test explicitly: `pmset sleepnow` on macOS to simulate sleep cycles

**Phase:** Phase 2 (Channel Adapters) -- each adapter must handle reconnection, but the suspend/resume hooks belong to Phase 1.

---

### Pitfall 1.3: Memory Leaks in Long-Running Daemon Process

**What goes wrong:** A daemon process that runs for days or weeks accumulates memory from event listeners, unclosed connections, message caches, and SDK internal state. discord.js bots have been reported leaking 20-30 MB/day in steady state, with high-traffic bots reaching OOM after 4-5 hours ([discordjs#7988](https://github.com/discordjs/discord.js/issues/7988)). Electron itself leaks if IPC listeners pile up without cleanup.

**Warning signs:**
- `process.memoryUsage().rss` trends upward over hours
- `MaxListenersExceededWarning` in logs
- GC pauses increase over time
- App becomes sluggish after running for days

**Prevention:**
1. Schedule periodic `process.memoryUsage()` checks; if RSS exceeds a threshold (e.g., 512 MB), restart the daemon gracefully
2. Always remove event listeners on disconnect/reconnect cycles
3. For discord.js, set `makeCache` and `sweepers` options to limit internal caches
4. Use `--expose-gc` and periodic `global.gc()` in the daemon subprocess as a safety valve
5. Monitor via `chrome://inspect` connected to the main process during development

**Phase:** Phase 1 (Daemon Core) -- build memory monitoring into the daemon supervisor from the start.

---

### Pitfall 1.4: Daemon Crash Recovery Without Data Loss

**What goes wrong:** The daemon crashes (OOM, unhandled rejection, SDK bug) and in-flight messages or pending actions are lost. Without a supervisor, the daemon stays dead until the user restarts the app.

**Warning signs:**
- Messages sent to Slack/Discord during a crash window never get agent responses
- No notification to the user that the daemon is down
- Daemon subprocess exit events not handled

**Prevention:**
1. Implement a supervisor loop in the main process: on daemon exit, wait 1 second, then respawn (with exponential backoff for repeated crashes, capping at 60 seconds)
2. Persist pending work to SQLite before processing. On restart, replay the pending queue.
3. Send an IPC notification to the renderer when the daemon goes down and comes back up
4. Limit restart attempts (e.g., 5 in 10 minutes) before entering a "paused" state that requires manual intervention

**Phase:** Phase 1 (Daemon Core) -- supervisor pattern is a prerequisite for all channel adapters.

---

## 2. Channel SDK Pitfalls

### Pitfall 2.1: Slack Socket Mode Silent Disconnection

**What goes wrong:** `@slack/socket-mode` stops receiving messages after running for days. The WebSocket appears connected, but Slack has dropped the session. The auto-reconnect logic fails silently when `apps.connections.open` returns errors ([slackapi#1495](https://github.com/slackapi/node-slack-sdk/issues/1495)). Additionally, the SDK does not handle `disconnect` events with `reason: 'too_many_websockets'` ([slackapi#1654](https://github.com/slackapi/node-slack-sdk/issues/1654)).

**Warning signs:**
- Slack messages stop arriving with no error events
- Logs show `pong_timeout` followed by reconnection attempts, then `Failed to send a message as the client is not ready`
- `too_many_websockets` disconnect reason in logs

**Prevention:**
1. Use `@slack/socket-mode` >= 1.3.0 (reconnection fixes)
2. Implement an application-level liveness check: track `lastMessageReceivedAt` and force reconnect if stale for > 2 minutes
3. Handle the `disconnect` event explicitly and check the `reason` field
4. Consider HTTP Events API for production reliability. Slack's own docs recommend HTTP over socket mode for production apps ([Slack docs](https://docs.slack.dev/apis/events-api/comparing-http-socket-mode/))
5. Socket mode cannot be used for Slack Marketplace apps

**Phase:** Phase 2 (Slack Adapter) -- the adapter must own its reconnection logic, not rely solely on the SDK.

---

### Pitfall 2.2: Discord.js Gateway Intents and Verification Wall

**What goes wrong:** The bot works in development with < 100 servers, then breaks at scale because MESSAGE_CONTENT is a privileged intent. Once a bot is in 75+ servers, Discord requires a verification application with detailed justification. Approval is not guaranteed and can take weeks ([Discord docs](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents)).

**Warning signs:**
- Bot receives `messageCreate` events but `message.content` is empty string
- Error: "Used disallowed intents" at gateway connection
- Bot stops working after organic growth past 75 guilds

**Prevention:**
1. Request only the intents you actually need. Avoid `Intents.FLAGS.GUILD_PRESENCES` and `Intents.FLAGS.GUILD_MEMBERS` unless required.
2. Design the bot to work with slash commands (no privileged intent needed) as the primary interaction model, with message content as optional enhancement
3. If message content is required, apply for privileged intents early (before reaching 75 servers) and document the use case
4. Cache the intent configuration so it can be toggled without code changes

**Phase:** Phase 2 (Discord Adapter) -- architectural decision about slash commands vs. message content must happen before implementation.

---

### Pitfall 2.3: Baileys (WhatsApp) Account Bans and Protocol Instability

**What goes wrong:** Baileys reverse-engineers the WhatsApp Web protocol. Meta actively detects and permanently bans accounts using unofficial automation. Bots that ran for years are now getting banned ([baileys#1869](https://github.com/WhiskeySockets/Baileys/issues/1869)). The library's WA_WEB_VERSION can stop generating QR codes when WhatsApp updates their protocol ([baileys#2107](https://github.com/WhiskeySockets/Baileys/issues/2107)). A malicious npm package mimicking Baileys (`lotusbail`) was discovered stealing credentials after 56K downloads ([The Register, Dec 2025](https://www.theregister.com/2025/12/22/whatsapp_npm_package_message_steal/)).

**Warning signs:**
- "Your account may be at risk" warning on the linked phone ([whatsmeow#810](https://github.com/tulir/whatsmeow/issues/810))
- QR code generation fails with 405 errors
- Session connects but becomes unstable in production
- v7.0.0 breaking changes require migration ([Baileys releases](https://github.com/WhiskeySockets/Baileys/releases))

**Prevention:**
1. Treat WhatsApp integration as highest-risk channel. Clearly warn users that their account could be banned.
2. Implement rate limiting and human-like delays between messages
3. Pin Baileys to a known-working version and test thoroughly before upgrading
4. Verify the npm package name exactly (`@whiskeysockets/baileys`) -- supply chain attacks are documented
5. Consider offering WhatsApp Business API (official, paid) as an alternative for users who need reliability
6. Build an abstraction layer so the WhatsApp adapter can be swapped out when Baileys breaks

**Phase:** Phase 3 (WhatsApp Adapter) -- defer to later phase due to instability risk. May be better as a community plugin.

---

### Pitfall 2.4: Gmail API Watch Expiry and Quota Exhaustion

**What goes wrong:** Gmail push notifications via Pub/Sub expire after 7 days with no automatic renewal. If you miss the renewal window, the app silently stops receiving email notifications. Calling `watch()` too frequently burns through quota. Per-user rate limit is 250 quota units/second; daily limit is 1 billion units per project, but individual methods have different costs ([Gmail quotas](https://developers.google.com/workspace/gmail/api/reference/quota)).

**Warning signs:**
- Emails stop triggering agent responses after ~7 days
- HTTP 429 "Too Many Requests" errors
- `watch()` response expiration timestamp is in the past
- No Pub/Sub messages arriving despite new emails

**Prevention:**
1. Schedule `watch()` renewal daily (not just every 7 days) to handle transient failures. Store `lastWatchAt` timestamp and compare on daemon startup.
2. Track `lastNotificationReceivedAt` -- if > 20 minutes with no notification for an active inbox, call `stop()` then `watch()` to reset ([Hiver engineering post](https://medium.com/hiver-engineering/gmail-apis-push-notifications-bug-and-how-we-worked-around-it-at-hiver-a0a114df47b4))
3. Implement exponential backoff for 429 errors
4. For a desktop app, consider IMAP IDLE as an alternative to Pub/Sub (avoids the need for a public webhook endpoint)
5. Log quota usage headers from every API response

**Phase:** Phase 2 (Gmail Adapter) -- watch renewal logic is a core requirement, not a nice-to-have.

---

## 3. SQLite in Desktop Apps

### Pitfall 3.1: WAL File Growth and Checkpoint Starvation

**What goes wrong:** In WAL mode, the `-wal` file grows indefinitely if there is always at least one active reader preventing checkpointing. This is called checkpoint starvation. In a daemon that continuously reads the database, the WAL file can grow to gigabytes ([SQLite docs](https://sqlite.org/wal.html)).

**Warning signs:**
- `.db-wal` file grows continuously, never shrinks
- Disk usage increases over days
- Database operations slow down as WAL grows

**Prevention:**
1. Use `PRAGMA wal_autocheckpoint = 1000` (default, but verify it's set)
2. Periodically close all read connections briefly to allow a full checkpoint
3. Schedule `PRAGMA wal_checkpoint(TRUNCATE)` during idle periods
4. Monitor WAL file size and alert if it exceeds a threshold (e.g., 100 MB)

**Phase:** Phase 1 (Database Layer) -- set up WAL and checkpoint configuration in the initial schema migration.

---

### Pitfall 3.2: Multi-Process Database Locking

**What goes wrong:** The Electron main process and the daemon subprocess both access the same SQLite database. WAL mode allows concurrent reads but only one writer at a time. Simultaneous writes from both processes cause "database is locked" errors. Bun's built-in `bun:sqlite` has a known Windows bug where WAL mode holds file locks beyond `close()` ([bun#25964](https://github.com/oven-sh/bun/issues/25964)).

**Warning signs:**
- `SQLITE_BUSY` or "database is locked" errors in logs
- Write operations occasionally fail
- Daemon writes succeed but main process writes fail (or vice versa)

**Prevention:**
1. Designate a single process as the primary database writer. Route all writes through the main process via IPC, or use the daemon as the sole writer.
2. Set `PRAGMA busy_timeout = 5000` to wait instead of failing immediately
3. Keep write transactions short (< 50ms)
4. If using `bun:sqlite`, test on all platforms. Consider `better-sqlite3` for Node.js compatibility in the Electron main process (runs in Node, not Bun).
5. The Bun subprocess (daemon) can use `bun:sqlite`; the Electron main process should use `better-sqlite3` or route through the daemon.

**Phase:** Phase 1 (Database Layer) -- access pattern must be decided before any adapter writes to the database.

---

### Pitfall 3.3: Database Corruption on Crash During Checkpoint

**What goes wrong:** If the OS crashes or power fails during a WAL checkpoint, and `fsync` was not honored, the database file can become corrupt. With `PRAGMA synchronous = NORMAL` (common for performance), committed transactions can be lost after a crash ([SQLite docs](https://www.sqlite.org/howtocorrupt.html)).

**Warning signs:**
- `SQLITE_CORRUPT` errors after app crash or force quit
- Queries return unexpected results after system restart
- `-wal` and `-shm` files in inconsistent state

**Prevention:**
1. Use `PRAGMA synchronous = NORMAL` (not OFF) -- acceptable tradeoff for desktop apps
2. Use `PRAGMA journal_mode = WAL` (not MEMORY or OFF)
3. Never store the database on a network filesystem (WAL requires shared memory)
4. Implement a schema version check on startup; if the database is corrupt, offer to rebuild from JSONL session files (Kata already persists sessions as JSONL)
5. Back up the database file periodically (copy during idle, not while writing)

**Phase:** Phase 1 (Database Layer) -- integrity checks and recovery strategy must exist before production data lands in SQLite.

---

### Pitfall 3.4: Bun sqlite vs better-sqlite3 API Mismatch

**What goes wrong:** `bun:sqlite` is inspired by `better-sqlite3` but not 1:1 compatible. Missing features include `statement.run()` not returning affected row counts in some versions, and libraries like `better-auth` expecting a `better-sqlite3` adapter specifically ([bun#16050](https://github.com/oven-sh/bun/issues/16050)). Performance benchmarks are also misleading -- `better-sqlite3` is faster for CPU-bound queries; `bun:sqlite` wins on JS object marshaling ([better-sqlite3#1057](https://github.com/WiseLibs/better-sqlite3/discussions/1057)).

**Warning signs:**
- Tests pass in Bun subprocess but fail in Electron main process (or vice versa)
- `statement.run()` returns unexpected values
- Third-party libraries fail with adapter errors

**Prevention:**
1. Write a thin `DatabaseAdapter` interface with `query()`, `run()`, `exec()`, `transaction()` methods
2. Implement two backends: `BunSqliteAdapter` (for daemon subprocess) and `BetterSqlite3Adapter` (for Electron main process)
3. Test both adapters against the same test suite
4. Do not depend on `bun:sqlite`-specific features (like class mapping) in shared code

**Phase:** Phase 1 (Database Layer) -- adapter pattern prevents lock-in and cross-runtime surprises.

---

## 4. Plugin System Pitfalls

### Pitfall 4.1: In-Process Plugin Crashes Take Down the Host

**What goes wrong:** Channel adapters run as plugins inside the daemon process. An unhandled exception in any adapter (e.g., Baileys parsing a malformed WhatsApp message) crashes the entire daemon, killing all channels.

**Warning signs:**
- One channel failure causes all channels to go offline
- `uncaughtException` in daemon logs points to adapter code
- Frequent daemon restarts

**Prevention:**
1. Wrap each adapter's message handler in try/catch at the top level
2. Use `process.on('uncaughtException')` and `process.on('unhandledRejection')` as last-resort handlers that log and isolate (not crash)
3. Consider running each adapter in its own worker thread (`worker_threads`) for fault isolation. A worker crash does not kill the main thread.
4. Implement a per-adapter health status. If an adapter crashes 3 times in 5 minutes, disable it and notify the user.

**Phase:** Phase 1 (Plugin Architecture) -- isolation strategy must be decided before adapters are built.

---

### Pitfall 4.2: Configuration Schema Evolution Breaks Existing Setups

**What goes wrong:** Channel adapter configuration schemas change between versions (e.g., adding required fields, renaming keys). Users upgrading find their adapters broken with cryptic validation errors.

**Warning signs:**
- Users report "invalid configuration" after update
- Migration code becomes increasingly complex
- Different users have different schema versions with no way to tell

**Prevention:**
1. Version the configuration schema explicitly (e.g., `"schemaVersion": 2`)
2. Write forward migrations for each schema version bump
3. Validate configuration at load time with clear error messages indicating which fields need updating
4. Never remove fields in a minor version; deprecate first, remove in next major
5. Store configuration as JSON with a `schemaVersion` field at the top level

**Phase:** Phase 1 (Plugin Architecture) -- schema versioning prevents pain in every subsequent release.

---

### Pitfall 4.3: Type Safety Erosion at Plugin Boundaries

**What goes wrong:** Channel adapters receive untyped data from external SDKs (Slack events, Discord messages, WhatsApp proto buffers). This untyped data propagates through the system, causing runtime errors far from the source.

**Warning signs:**
- `TypeError: Cannot read property 'x' of undefined` in agent processing code
- Inconsistent message formats between channels
- Defensive `?.` chains spreading through the codebase

**Prevention:**
1. Define a canonical `IncomingMessage` type in `@craft-agent/core` that all adapters must map into
2. Validate external data at the adapter boundary using a schema validator (Zod or TypeBox)
3. Each adapter is responsible for mapping SDK-specific types into the canonical type. The daemon core never sees SDK types.
4. Write adapter-specific tests with real payloads captured from each SDK

**Phase:** Phase 1 (Plugin Architecture) -- canonical message type is the contract between adapters and the agent.

---

## 5. Permission and Security Pitfalls

### Pitfall 5.1: Autonomous AI Actions Without User Oversight

**What goes wrong:** In the current Kata model, the user sees the agent's actions in real-time and can intervene. In always-on mode, the agent acts on incoming messages while the user may be away. A Slack message could trigger the agent to run destructive bash commands, send emails, or modify files. 39% of enterprises reported AI agents accessing unintended systems in 2025 ([Skywork AI](https://skywork.ai/blog/agentic-ai-safety-best-practices-2025-enterprise/)).

**Warning signs:**
- Agent executes write operations (file edits, git commits, API calls) triggered by external messages
- No audit log of autonomous actions
- Tool allowlist from interactive mode is too permissive for unattended mode

**Prevention:**
1. Create a separate `PermissionMode` for always-on: `'daemon'` mode that is more restrictive than `'safe'` mode
2. Allowlist only read-only tools by default. Write operations require explicit per-channel configuration.
3. Require human-in-the-loop approval for destructive actions: queue them and notify the user via the desktop UI or a push notification
4. Log every autonomous action to a persistent audit trail (SQLite table with timestamp, channel, message, tools invoked, results)
5. Implement a kill switch: any message containing a configurable stop phrase (e.g., `/stop`) immediately halts the agent

**Phase:** Phase 1 (Daemon Core) -- permission model for unattended operation is a prerequisite for any channel adapter.

---

### Pitfall 5.2: Prompt Injection via Channel Messages

**What goes wrong:** An attacker sends a crafted message via Slack, Discord, or WhatsApp that manipulates the agent's behavior. Channel messages are untrusted input, but the agent treats them as instructions. A poisoned tool response or long conversation can weaken resistance to violations ([HelpNetSecurity, Dec 2025](https://www.helpnetsecurity.com/2025/12/09/ai-agent-testing-research/)).

**Warning signs:**
- Agent performs unexpected actions after receiving specific messages
- Agent ignores its system prompt constraints
- Agent leaks system prompt content or credential information

**Prevention:**
1. Prepend channel messages with a clear system-level framing: `[External message from {channel}/{user}] {content}` so the model can distinguish external input from system instructions
2. Never include credentials, API keys, or system prompt content in the agent's context when processing channel messages
3. Implement input sanitization: strip known injection patterns, limit message length
4. Run the agent with a channel-specific system prompt that explicitly restricts tool access
5. Rate-limit per-user message processing to prevent rapid-fire injection attempts

**Phase:** Phase 1 (Daemon Core) -- input framing and sanitization are foundational security measures.

---

### Pitfall 5.3: Credential Sprawl Across Multiple Services

**What goes wrong:** Each channel requires its own credentials (Slack bot token, Discord bot token, WhatsApp session auth, Gmail OAuth refresh token). Kata currently stores credentials in a single AES-256-GCM encrypted file (`credentials.enc`). Adding 4+ credential sets increases the blast radius if the encryption key is compromised. OAuth refresh tokens expire or get revoked, and the app has no way to notify the user.

**Warning signs:**
- Channel adapter silently stops working because a token expired
- User has no visibility into which credentials are valid
- Credentials file grows large and hard to manage
- Token refresh failures not surfaced to the UI

**Prevention:**
1. Extend `CredentialManager` with per-service credential types and a health check method that validates each token
2. Implement token refresh logic for OAuth-based services (Gmail, Slack) with proactive renewal before expiry
3. Surface credential status in the UI: green/yellow/red indicator per channel
4. Consider using the macOS Keychain (`security` CLI) as an alternative backend for platform-native encryption
5. Log credential refresh events to help debug authentication failures
6. Store each channel's credentials independently so revoking one doesn't require re-encrypting all

**Phase:** Phase 1 (Credential Extension) -- credential infrastructure must support multiple services before adapters are built.

---

### Pitfall 5.4: Tool Allowlist Bypass Through Channel Context

**What goes wrong:** The existing permission system (`safe`/`ask`/`allow-all`) is per-session. A daemon session could be configured as `allow-all`, giving channel-triggered messages full tool access. Or a user might configure `allow-all` for interactive use, forgetting that the same workspace permissions apply to always-on mode.

**Warning signs:**
- Agent running bash commands triggered by Discord messages
- No distinction between interactive and daemon permission scope
- Workspace-level `permissions.json` applied uniformly to both modes

**Prevention:**
1. Daemon sessions must always override to a restricted permission mode regardless of workspace settings
2. Maintain a separate `daemonPermissions.json` per workspace that defines which tools are available in always-on mode
3. Block `bash`, `computer`, and other high-risk tools by default in daemon mode
4. Require explicit opt-in (not opt-out) for each tool in daemon mode

**Phase:** Phase 1 (Daemon Core) -- permissions architecture must differentiate interactive from autonomous contexts.

---

## 6. Desktop-Specific Pitfalls

### Pitfall 6.1: macOS App Nap Throttles the Daemon

**What goes wrong:** macOS App Nap detects that the Electron window is not visible and throttles timers and I/O for the entire app, including the daemon subprocess. Timer firing frequency is reduced, network I/O is deprioritized, and the daemon effectively stops processing messages in real-time ([Apple docs](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html)).

**Warning signs:**
- Message response latency increases when app window is minimized or hidden
- Heartbeat timeouts cause reconnection loops
- Energy Impact shows "App Nap" in Activity Monitor

**Prevention:**
1. Use `powerSaveBlocker.start('prevent-app-suspension')` while the daemon is active. Release it when the daemon is paused.
2. Alternatively, run the daemon as a detached subprocess that is not subject to App Nap (but this complicates lifecycle management)
3. Set `NSSupportsAutomaticTermination = NO` and `NSSupportsSuddenTermination = NO` in `Info.plist` to prevent macOS from terminating the app
4. Test by minimizing the app and sending messages from each channel; measure response latency

**Phase:** Phase 1 (Daemon Core) -- App Nap mitigation must be active whenever the daemon is running.

---

### Pitfall 6.2: Electron on macOS Tahoe (26) Performance Regression

**What goes wrong:** Electron apps on macOS 26 (Tahoe) cause system-wide GPU lag affecting all apps, not just the Electron app itself. This is a known issue being addressed by both Apple and the Electron team ([electron#48311](https://github.com/electron/electron/issues/48311)). A long-running daemon compounds the problem since the app is always active.

**Warning signs:**
- System-wide UI stuttering when the app is running
- Other apps (Finder, Safari) become sluggish
- Users on macOS 26 report the issue but macOS 15 users do not

**Prevention:**
1. Track the Electron issue and upgrade promptly when fixes ship. The fix has begun rolling out to apps.
2. Test on macOS 26 specifically during development
3. Consider hiding (not minimizing) the window when the user doesn't need the UI, to reduce GPU compositing work
4. If the daemon doesn't need a visible window, explore running it headless

**Phase:** Cross-cutting -- monitor and test on macOS 26 throughout development. No architectural change needed, just awareness.

---

### Pitfall 6.3: Code Signing and Notarization with Network Entitlements

**What goes wrong:** Adding WebSocket connections (Slack, Discord) and outbound HTTP (Gmail API) requires the `com.apple.security.network.client` entitlement in the code signature. If the app is sandboxed for Mac App Store distribution, missing entitlements cause silent connection failures. Hardened runtime (required for notarization) restricts JIT and unsigned memory, which can break Bun subprocesses ([electron-builder#3989](https://github.com/electron-userland/electron-builder/issues/3989)).

**Warning signs:**
- Network connections fail in the signed/notarized build but work in development
- App crashes on launch with hardened runtime enabled
- Gatekeeper blocks the app after update
- `codesign --verify` fails with entitlement errors

**Prevention:**
1. Add `com.apple.security.network.client` to the app entitlements file
2. Add `com.apple.security.cs.allow-jit` for Bun subprocess execution
3. Test the signed build (not just development) for every release. Use `codesign --verify --deep --strict` and `spctl --assess`.
4. Maintain separate entitlement files for the app bundle and child processes ([Electron osx-sign wiki](https://github.com/electron/electron-osx-sign/wiki/3.-App-Sandbox-and-Entitlements))
5. Do NOT add `com.apple.security.cs.allow-unsigned-executable-memory` on Electron 12+ (increases attack surface)

**Phase:** Phase 1 (Build Pipeline) -- entitlement changes must be in place before the first beta build.

---

### Pitfall 6.4: Energy Impact and Battery Drain

**What goes wrong:** An always-on daemon with active WebSocket connections, periodic heartbeats, and scheduled API calls (Gmail watch renewal) keeps the CPU from sleeping. Chromium's background tab power savings become more aggressive, but the main process is unaffected by these ([Electron background performance](https://pracucci.com/electron-slow-background-performances.html)). Users see the app in Activity Monitor with "High" energy impact.

**Warning signs:**
- "High Energy Impact" badge in Activity Monitor
- Battery life noticeably shorter when app is running
- Fan activity increases even when app is idle
- Users complain about battery drain in reviews

**Prevention:**
1. Batch network operations where possible (check all channels in one pass, not individual timers)
2. Use coalesced timers (`setInterval` with tolerance, or `NSTimer` with tolerance via native module)
3. Allow users to set a "quiet hours" schedule that pauses the daemon
4. Implement "low power mode" detection via `powerMonitor` and reduce polling frequency accordingly
5. Profile energy impact with Xcode Instruments Energy Diagnostics during development

**Phase:** Phase 2 (Polish) -- energy optimization matters for user retention, but basic functionality comes first.

---

## Phase-Specific Warning Summary

| Phase | Pitfall | Severity | Mitigation |
|-------|---------|----------|------------|
| Phase 1: Daemon Core | Zombie processes (1.1) | Critical | PID registry, cleanup hooks |
| Phase 1: Daemon Core | Crash recovery (1.4) | Critical | Supervisor with backoff |
| Phase 1: Daemon Core | Autonomous actions (5.1) | Critical | Restricted daemon permission mode |
| Phase 1: Daemon Core | Prompt injection (5.2) | Critical | Input framing, tool restrictions |
| Phase 1: Daemon Core | App Nap throttling (6.1) | High | powerSaveBlocker |
| Phase 1: Database | Multi-process locking (3.2) | High | Single-writer pattern |
| Phase 1: Database | WAL growth (3.1) | Medium | Checkpoint scheduling |
| Phase 1: Database | Bun/better-sqlite3 mismatch (3.4) | Medium | Adapter interface |
| Phase 1: Plugin Arch | In-process crashes (4.1) | High | Worker thread isolation |
| Phase 1: Plugin Arch | Type safety (4.3) | Medium | Canonical message type |
| Phase 1: Credentials | Credential sprawl (5.3) | High | Per-service health checks |
| Phase 1: Build | Code signing (6.3) | High | Entitlement audit |
| Phase 2: Slack | Silent disconnection (2.1) | High | App-level liveness check |
| Phase 2: Discord | Privileged intents (2.2) | High | Slash command primary |
| Phase 2: Gmail | Watch expiry (2.4) | High | Daily renewal |
| Phase 2: Polish | Battery drain (6.4) | Medium | Batching, quiet hours |
| Phase 3: WhatsApp | Account bans (2.3) | Critical | User warnings, abstraction layer |
| Cross-cutting | Sleep/wake (1.2) | High | powerMonitor resume handler |
| Cross-cutting | Memory leaks (1.3) | High | RSS monitoring, leak detection |
| Cross-cutting | macOS Tahoe regression (6.2) | Medium | Track Electron fixes |
| Cross-cutting | Schema evolution (4.2) | Medium | Versioned configs |

---

## Sources

### Official Documentation
- [SQLite WAL Mode](https://sqlite.org/wal.html)
- [SQLite How To Corrupt](https://www.sqlite.org/howtocorrupt.html)
- [Gmail API Push Notifications](https://developers.google.com/workspace/gmail/api/guides/push)
- [Gmail API Quotas](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Slack Socket Mode vs HTTP](https://docs.slack.dev/apis/events-api/comparing-http-socket-mode/)
- [Discord Privileged Intents](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents)
- [Apple App Nap](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/AppNap.html)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [Electron Mac App Store Guide](https://www.electronjs.org/docs/latest/tutorial/mac-app-store-submission-guide)
- [Bun SQLite](https://bun.com/docs/runtime/sqlite)

### GitHub Issues (Verified)
- [electron#24135](https://github.com/electron/electron/issues/24135) -- Electron crashes during macOS sleep/wakeup
- [electron#34808](https://github.com/electron/electron/issues/34808) -- Unreferenced child process prevents exit
- [electron#48311](https://github.com/electron/electron/issues/48311) -- macOS 26 Tahoe GPU lag
- [slackapi#1495](https://github.com/slackapi/node-slack-sdk/issues/1495) -- Socket mode reconnection failure
- [slackapi#1652](https://github.com/slackapi/node-slack-sdk/issues/1652) -- Socket mode stops responding
- [slackapi#1654](https://github.com/slackapi/node-slack-sdk/issues/1654) -- too_many_websockets not handled
- [discordjs#7988](https://github.com/discordjs/discord.js/issues/7988) -- Memory leak after login
- [baileys#1869](https://github.com/WhiskeySockets/Baileys/issues/1869) -- High number of bans
- [baileys#2107](https://github.com/WhiskeySockets/Baileys/issues/2107) -- QR generation fails with 405
- [whatsmeow#810](https://github.com/tulir/whatsmeow/issues/810) -- Account risk warning
- [bun#25964](https://github.com/oven-sh/bun/issues/25964) -- WAL mode file lock on Windows
- [bun#16050](https://github.com/oven-sh/bun/issues/16050) -- better-sqlite3 compatibility
- [electron-builder#3989](https://github.com/electron-userland/electron-builder/issues/3989) -- Hardened runtime crashes

### Community Reports and Analysis
- [Hiver: Gmail API push notification bug workaround](https://medium.com/hiver-engineering/gmail-apis-push-notifications-bug-and-how-we-worked-around-it-at-hiver-a0a114df47b4)
- [Electron background performance](https://pracucci.com/electron-slow-background-performances.html)
- [better-sqlite3 vs bun:sqlite benchmarks](https://github.com/WiseLibs/better-sqlite3/discussions/1057)
- [SQLite concurrent writes](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/)
- [AI agents break rules in unexpected ways](https://www.helpnetsecurity.com/2025/12/09/ai-agent-testing-research/)
- [Agentic AI safety best practices 2025](https://skywork.ai/blog/agentic-ai-safety-best-practices-2025-enterprise/)
- [Malicious Baileys npm package](https://www.theregister.com/2025/12/22/whatsapp_npm_package_message_steal/)
- [Electron osx-sign entitlements wiki](https://github.com/electron/electron-osx-sign/wiki/3.-App-Sandbox-and-Entitlements)
