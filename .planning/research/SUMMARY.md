# v0.7.0 Research Summary: Always-On Assistant

**Synthesis Date:** 2026-02-07
**Research Scope:** Daemon process, communication channels, plugin system, service integrations
**Source Documents:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md

---

## Executive Summary

v0.7.0 introduces always-on assistant capabilities through three core pillars:

1. **Daemon Foundation:** Background process running in Electron main, spawning agent sessions for inbound events
2. **Communication Channels:** Slack and Gmail integrations with message ingress and agent response routing
3. **Service Plugin System:** First-party plugin architecture for channel adapters

The implementation is strictly additive to existing architecture. No breaking changes to SessionManager, CraftAgent, source system, or session persistence.

**Critical Path:** Daemon Core → SQLite Queue → Channel Adapters → Permission Model → UI Integration

**Deferred to v0.8.0+:** Discord, WhatsApp (instability risk), scheduled tasks, event-driven triggers, session handoff

---

## Technology Decisions

### Communication Channel SDKs

| Service | SDK | Version | Ingress | Confidence | Status |
|---------|-----|---------|---------|------------|--------|
| **Slack** | @slack/web-api | 7.13.0 | Poll (conversations.history) | HIGH | v0.7.0 |
| Gmail | @googleapis/gmail | 15.0.0 | Poll (history.list) | HIGH | v0.7.0 |
| Discord | discord.js | 14.25.1 | Subscribe (WebSocket) | HIGH | Deferred |
| WhatsApp | @whiskeysockets/baileys | 7.0.0-rc.9 | Subscribe (WebSocket) | MEDIUM | Deferred (risk) |

**Slack Decision Rationale:** HTTP polling via `@slack/web-api` only. Socket Mode deferred to minimize OAuth complexity (requires app-level token xapp-* in addition to bot token xoxb-*). Polling at 2s intervals fits within rate limits (50 calls/min per channel).

**WhatsApp Risk:** Baileys reverse-engineers WhatsApp protocol. Meta actively bans automation. 7.0.0-rc.9 is a release candidate. Protocol instability documented in GitHub issues. Recommend deferring entirely or offering as experimental with clear warnings.

**Gmail vs full googleapis:** Start with `@googleapis/gmail` (2MB) over full `googleapis` (80MB). Switch to full package only if Calendar/Drive channels are added later.

### SQLite: bun:sqlite vs better-sqlite3

**Decision:** Use `bun:sqlite` in Bun daemon subprocess, but route Electron main process queries through IPC instead of direct database access.

**Why avoid dual access:**
- Cross-runtime WAL compatibility uncertain (bun:sqlite and better-sqlite3 use different SQLite builds)
- better-sqlite3 requires native module rebuilding for Electron (electron-rebuild complexity)
- File locking edge cases between Node.js and Bun processes
- Windows bug: bun:sqlite WAL holds locks beyond close() (bun#25964)

**Alternative approach:** Daemon exposes query interface over stdin/stdout JSON protocol. Electron sends query requests; daemon reads via bun:sqlite and returns results. +1ms IPC latency acceptable for UI display.

### Daemon Process Model

**Subprocess:** Spawned from Electron main process via Node.js `child_process.spawn`, not Bun.spawn (main process is Node.js, not Bun).

**Communication:** Line-delimited JSON over stdin/stdout (same pattern as existing agent subprocesses).

**Lifecycle:**
- Start on app launch after auth confirmed
- Stop on `app.before-quit` with SIGTERM + 5s grace period
- Supervisor with exponential backoff (1s, 2s, 4s... max 30s) for crash recovery
- After 5 consecutive crashes, enter paused state requiring manual intervention

**PID tracking:** Write daemon PID to `~/.kata-agents/daemon.pid`. On startup, kill stale PIDs to prevent zombie processes.

### Plugin System Architecture

**v0.7.0:** Static registry, bundled first-party plugins only. No discovery, no dynamic loading.

```
packages/shared/src/plugins/builtin/
  slack/
    index.ts              # KataPlugin implementation
    slack-adapter.ts      # ChannelAdapter
  gmail/
    index.ts
    gmail-adapter.ts
```

**Plugin contract:**
```typescript
interface KataPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  registerChannels?(registry: ChannelRegistry): void;
  registerTools?(registry: ToolRegistry): void;
  registerServices?(registry: ServiceRegistry): void;
  initialize?(context: PluginContext): Promise<void>;
  shutdown?(): Promise<void>;
}
```

**v0.8.0+:** Dynamic loading via `import()`, manifest-based discovery, Bun Workers for sandboxing.

---

## Architecture Integration

### DaemonManager as Peer to SessionManager

**Location:** `apps/electron/src/main/daemon.ts` (NEW)

DaemonManager lives in Electron main process, parallel to SessionManager. It does not replace SessionManager; it creates daemon-specific sessions through SessionManager's existing API.

```
Main Process:
  WindowManager (unchanged)
  SessionManager (minor extension: daemon session fields)
  DaemonManager (NEW)
    ├── PluginRegistry
    ├── DaemonMessageQueue (SQLite)
    ├── TaskScheduler (SQLite)
    └── activeChannelSessions: Map<channelId, sessionId>
```

**Strictly additive:** No changes to CraftAgent API, session JSONL format, source storage, credential encryption, or IPC event format.

### Per-Channel Sessions with Compaction

Each channel gets a dedicated `ManagedSession` with session ID convention: `daemon-{channelSlug}-{workspaceId}`.

Long-running daemon sessions hit context limits. SDK's built-in compaction handles this. Existing `pendingPlanExecution` / `markCompactionComplete` pattern supports post-compaction recovery.

### Channel Storage Pattern

**Location:** `~/.kata-agents/workspaces/{id}/channels/{slug}/config.json`

Follows source storage pattern. New workspace subdirectory `channels/` alongside `sources/`, `sessions/`, `skills/`.

Channels reference existing sources for credentials:
```typescript
interface ChannelConfig {
  slug: string;
  enabled: boolean;
  adapter: string;
  credentials: {
    sourceSlug: string;  // e.g., "slack" references existing Slack source
  };
}
```

**Credential reuse:** Slack channel uses same bot token as Slack source. Gmail channel uses same OAuth token as Gmail source. No duplicate credential storage.

### Daemon Permission Mode

Add `'daemon'` to `PermissionMode` union. Daemon mode is more restrictive than `safe` mode.

**Behavior:** Like `ask` with auto-approval for configurable allowlist (defined per plugin). Default blocks `bash`, `computer`, and write operations.

**Rationale:** Autonomous AI actions without user oversight require explicit per-channel tool configuration. Interactive permission modes (`safe`/`ask`/`allow-all`) are too permissive for unattended operation.

### Data Flow: Inbound Message Processing

```
Channel Adapter (poll/subscribe)
  → DaemonManager.onChannelMessage()
    → SQLite message queue (enqueue)
    → processQueue()
      → find or create daemon session for channelId
      → SessionManager.sendMessage(sessionId, formattedMessage)
        → CraftAgent.chat() [existing flow]
        → streaming events → IPC → renderer
      → on complete: check for reply action
        → Channel Adapter.sendReply()
      → SQLite message queue (dequeue / mark processed)
```

### SQLite Integration

**Location:** `~/.kata-agents/daemon.db` (global, not workspace-scoped)

**Tables:**
- `message_queue` - pending messages from channel adapters
- `task_schedule` - cron-style scheduled triggers (deferred to v0.8.0)
- `channel_state` - last poll cursor, subscription state per channel

**Why global:** Daemon manages channels across workspaces. Single database avoids coordination.

**WAL mode:** `PRAGMA journal_mode = WAL` for concurrent readers + single writer. `PRAGMA synchronous = NORMAL` for performance. Schedule `PRAGMA wal_checkpoint(TRUNCATE)` during idle to prevent unbounded WAL growth.

---

## Feature Prioritization

### Table Stakes (Must-Have for v0.7.0)

**Communication Channels:**
- Receive messages from channels (Slack, Gmail)
- Send messages to channels
- Channel selector/routing (explicit configuration)
- Message threading (Slack `thread_ts`)
- Mention/trigger mode (Slack `app_mention`, Gmail label filter)

**Service Plugins:**
- Read emails (Gmail API search)
- Draft emails (Gmail API `drafts.create`)
- Send emails with confirmation (two-step: draft then send after UI approval)

**Daemon:**
- System tray / menu bar presence
- Background process survival (window closes, daemon continues)
- Quick launch from tray (keyboard shortcut)
- Status indicator (idle/processing/error)
- Graceful shutdown

**Security:**
- Action confirmation for consequential operations (send email, post message)
- Per-channel permissions
- Credential isolation (extend existing blocked env vars)
- Audit log (append-only per workspace)

**Session Management:**
- One session per channel thread
- Session persistence across restarts
- Context carryover within thread

### Differentiators (Unique to Kata)

**Channel-to-Session Mapping:** Each Slack thread or Gmail email becomes a Kata session with full context, tools, and MCP access. No competitor maps channel conversations into a rich desktop session.

**Unified Session View:** Channel sessions appear in same session list as direct chat sessions. User switches between Kata UI and Slack/Gmail, same session.

**Cross-Source Context:** Agent uses Gmail source + Linear MCP source in one session. "Summarize emails from Alice and create Linear ticket."

**Send with Confirmation:** Agent drafts email/message, shows in Kata UI, user confirms, then sends. Trust-building pattern from ChatGPT Agent.

### Anti-Features (Explicitly Out of Scope)

**WhatsApp Integration:** Policy barriers. Meta blocks AI chatbots. High ban risk. Baileys protocol instability.

**Auto-Reply to All Messages:** Noisy bots erode trust. Default to @mention or keyword trigger. Explicit opt-in per channel.

**Auto-Send Emails:** Trust-destroying action. Always require explicit confirmation.

**Always-Listening Voice:** Privacy-sensitive. Requires speech-to-text. Text-only triggers.

**Auto-Start on Login:** Aggressive. Offer as opt-in, off by default.

**Full Inbox Management:** Gemini 3's "autonomous inbox" is Google's game. Kata provides read, search, draft, label, not "manage my inbox."

---

## Critical Pitfalls and Mitigations

### 22 Verified Pitfalls Across 6 Categories

**Daemon Lifecycle:**
1. Zombie processes on app exit → PID registry, cleanup hooks
2. macOS sleep/wake breaks connections → powerMonitor resume handler
3. Memory leaks in long-running process → RSS monitoring, scheduled restarts
4. Crash recovery without data loss → supervisor with SQLite queue replay

**Channel SDKs:**
5. Slack Socket Mode silent disconnection → app-level liveness check
6. Discord privileged intents verification wall → slash commands primary, intents opt-in
7. Baileys WhatsApp account bans → defer entirely, too high risk
8. Gmail watch expiry after 7 days → daily renewal, stored historyId

**SQLite:**
9. WAL file growth → checkpoint scheduling, close readers periodically
10. Multi-process locking → single-writer pattern (daemon only)
11. Corruption on crash during checkpoint → integrity checks, JSONL fallback
12. bun:sqlite vs better-sqlite3 API mismatch → adapter interface

**Plugin System:**
13. In-process plugin crashes → worker thread isolation or try/catch boundaries
14. Configuration schema evolution → versioned configs, migrations
15. Type safety erosion → canonical IncomingMessage type, Zod validation

**Security:**
16. Autonomous actions without oversight → restricted daemon permission mode
17. Prompt injection via channel messages → input framing, tool restrictions
18. Credential sprawl → per-service health checks, proactive refresh
19. Tool allowlist bypass → separate daemonPermissions.json

**Desktop Platform:**
20. macOS App Nap throttles daemon → powerSaveBlocker
21. Electron on macOS 26 GPU lag → track Electron fixes, test on 26
22. Code signing network entitlements → com.apple.security.network.client

**Severity breakdown:** 8 Critical, 10 High, 4 Medium.

### Highest-Risk Items

**Critical (blocks launch if not addressed):**
- Zombie processes (1)
- Autonomous actions (16)
- Prompt injection (17)
- WhatsApp bans (7)

**High (degrades UX or reliability):**
- Slack disconnection (5)
- Multi-process locking (10)
- In-process crashes (13)
- Credential sprawl (18)
- App Nap (20)

---

## Build Order (7 Phases)

### Phase 1: Foundation Types and SQLite
**Files:** `packages/shared/src/plugins/types.ts`, `packages/shared/src/channels/types.ts`, `packages/core/src/types/daemon.ts`, SQLite schema

**Why first:** Pure types, no runtime behavior. All subsequent phases import these.

**Dependencies:** None.

**Tests:** Unit tests for type validation.

### Phase 2: Daemon Permission Mode
**Files:** `packages/shared/src/agent/mode-types.ts`, `mode-manager.ts`, `permissions-config.ts`

**Why second:** Daemon needs permission mode before running agents. Small surface area.

**Dependencies:** Phase 1 types.

**Tests:** shouldAllowToolInMode with daemon mode.

### Phase 3: SQLite Message Queue and Task Scheduler
**Files:** `apps/electron/src/main/daemon-db.ts`

**Why third:** Queue is daemon's central state. Must work before adapters push into it.

**Dependencies:** Phase 1 types, better-sqlite3.

**Tests:** Enqueue/dequeue, WAL checkpointing.

### Phase 4: DaemonManager Core
**Files:** `apps/electron/src/main/daemon.ts`, `index.ts` (lifecycle), `ipc.ts` (handlers), `shared/types.ts` (IPC channels)

**Why fourth:** Orchestrator connecting queue to SessionManager.

**Dependencies:** Phases 1-3.

**Tests:** Mock channel adapter enqueuing synthetic messages.

### Phase 5: First Channel Adapter (Gmail Polling)
**Files:** `packages/shared/src/plugins/builtin/gmail/`, channel config storage, credential sharing

**Why Gmail first:** OAuth flow proven, API source exists, polling simpler than WebSocket.

**Dependencies:** Phases 1-4, existing Gmail source.

**Tests:** Poll cycle, historyId cursor, draft/send flow.

### Phase 6: Renderer Integration
**Files:** `apps/electron/src/renderer/atoms/daemon.ts`, `hooks/useDaemon.ts`, `preload/index.ts`, UI components

**Why sixth:** Daemon runs headlessly before UI exists. UI important for usability, not validation.

**Dependencies:** Phase 4 (daemon IPC).

**Tests:** IPC round-trip, status updates, channel CRUD.

### Phase 7: Additional Channel Adapters
**Files:** `packages/shared/src/plugins/builtin/slack/`

**Why last:** Each adapter independent. Gmail proves pattern.

**Dependencies:** Phases 1-5 pattern established.

**Tests:** Slack conversations.history polling, thread mapping.

---

## Roadmap Implications

### Milestone Scoping

**v0.7.0 Scope:**
- Daemon foundation (Phases 1-4)
- Gmail service plugin (Phase 5)
- Slack channel adapter (Phase 7)
- Renderer integration (Phase 6)
- Audit log, per-channel permissions

**Estimated effort:** 6-8 weeks (2-3 weeks per phase, phases 5-7 parallelizable).

**v0.8.0 Deferred:**
- Discord adapter (privileged intents complexity)
- WhatsApp adapter (ban risk, protocol instability)
- Scheduled tasks (task scheduler infrastructure)
- Event-driven triggers (trigger listener framework)
- Session handoff (bidirectional sync between desktop and channel)
- Least-privilege scoping (time-bounded permissions)

### User-Facing Value Proposition

**v0.7.0 delivers:**
1. Monitor Slack channels for @mentions, respond with full agent capabilities
2. Search Gmail, draft emails, send with confirmation
3. Channel conversations appear as desktop sessions (unique to Kata)
4. Always-on assistant without keeping window open

**Competitive position:** Only desktop AI assistant unifying direct chat, channel conversations, and service plugins in a single interface with local MCP servers and workspace-scoped permissions.

**Gaps vs competitors:**
- ChatGPT Agent: Web-only, no desktop sessions
- Claude Desktop: No integrations
- Microsoft Copilot: Locked to M365
- Lindy AI: No desktop app

### Risk Assessment for Roadmap Planning

**High-confidence items:**
- Slack HTTP polling (proven SDK, existing OAuth)
- Gmail polling (existing OAuth, Gmail API stable)
- Daemon subprocess management (existing SessionManager pattern)
- Permission system extension (existing mode infrastructure)

**Medium-confidence items:**
- SQLite cross-process coordination (WAL mode well-documented but bun:sqlite + better-sqlite3 combo untested)
- Crash recovery with queue replay (depends on SQLite reliability)
- Memory leak mitigation (requires production telemetry)

**Low-confidence items:**
- WhatsApp via Baileys (ban risk, protocol instability, RC version)
- Discord at scale (privileged intents verification process)
- Energy impact optimization (platform-specific, requires profiling)

### Dependencies on Existing Infrastructure

**Existing features that accelerate v0.7.0:**
- Slack OAuth (packages/shared/src/auth/slack-oauth.ts)
- Google OAuth (packages/shared/src/auth/google-oauth.ts)
- Source system (packages/shared/src/sources/)
- Permission modes (safe/ask/allow-all)
- Session persistence (JSONL)
- MCP client (packages/shared/src/mcp/client.ts)
- Credential manager (AES-256-GCM)
- Bun subprocess model (apps/electron/src/main/sessions.ts)

**No breaking changes required to existing systems.**

### Testing Strategy

**Unit tests:**
- Channel adapters (mock SDK responses)
- SQLite queue (enqueue/dequeue, checkpointing)
- Permission mode filtering (daemon allowlist)

**Integration tests:**
- DaemonManager + mock adapter
- Credential refresh flow
- Session creation from channel message

**E2E tests (live API):**
- Slack polling cycle
- Gmail draft/send flow
- Daemon crash recovery
- macOS sleep/wake resilience

**Platform-specific tests:**
- macOS App Nap behavior
- Code signing with network entitlements
- Energy impact profiling

### Open Questions for Roadmap

1. **Slack Socket Mode vs HTTP polling:** Start with polling (simpler), add Socket Mode in v0.8.0 for lower latency?
2. **Tray-only mode:** Should daemon run with all windows closed? Requires menu bar/tray icon as sole interface.
3. **Multi-workspace channel management:** One daemon per workspace or global daemon managing all workspaces?
4. **Discord deployment:** Desktop bot (user runs Discord app) or hosted bot (Kata hosts Discord connection)?
5. **WhatsApp inclusion timeline:** Skip v0.7.0 and v0.8.0 entirely, revisit when official API available?

---

## Key Findings Summary

### Stack
- Slack: @slack/web-api HTTP polling, not Socket Mode (simpler OAuth)
- Discord: discord.js 14.25.1, slash commands primary to avoid privileged intents
- WhatsApp: Baileys 7.0.0-rc.9 deferred (ban risk, protocol instability)
- Gmail: @googleapis/gmail 15.0.0 polling with historyId cursor
- SQLite: bun:sqlite in daemon, IPC queries from Electron, no better-sqlite3 native module

### Features
- Table stakes: receive/send messages, channel routing, threading, mention triggers
- Differentiators: channel-to-session mapping, unified session view, cross-source context, send with confirmation
- Anti-features: WhatsApp, auto-reply, auto-send, voice, full inbox management

### Architecture
- DaemonManager as peer to SessionManager, strictly additive
- Per-channel sessions with SDK compaction
- Channel storage follows source pattern, credentials reuse existing OAuth
- Daemon permission mode with tool allowlist
- SQLite global database, WAL mode, IPC queries from Electron

### Pitfalls
- 22 verified pitfalls across 6 categories
- 8 Critical (zombie processes, autonomous actions, prompt injection, WhatsApp bans)
- 10 High (Slack disconnection, SQLite locking, plugin crashes, App Nap)
- Mitigation strategies for each with phase assignments

**Recommendation:** Proceed with v0.7.0 scoped to Slack + Gmail. Defer Discord and WhatsApp. Build Phase 1-4 (daemon foundation) before any adapter to establish permission and security boundaries.
