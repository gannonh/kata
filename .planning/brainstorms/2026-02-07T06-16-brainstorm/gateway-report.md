# Gateway Architecture Report: Kata Agents v0.7.0

Debate between explorer-gateway and challenger-gateway. This report captures the converged recommendations after three rounds of proposals, critique, and revision.

---

## Executive Summary

The original proposals advocated for a full OpenClaw-style gateway architecture: WebSocket daemon, 22-adapter plugin SDK, 13 lifecycle hooks, filesystem plugin discovery, multi-tenant message routing, and a service plugin framework. After debate, both sides converged on a substantially reduced architecture that takes targeted insights from OpenClaw while respecting Kata's scale as a single-user desktop application.

The recommended architecture has six components totaling an estimated 2,000-3,000 lines of infrastructure plus 500-1,000 lines per channel adapter.

---

## Recommended Architecture

### 1. Managed Background Process (Opt-In)

**What:** A Bun subprocess that the Electron app spawns but that persists independently when the app closes. Uses a PID file and heartbeat for lifecycle management. Communication via Unix domain sockets (macOS) or named pipes (Windows).

**Scope:** Only channel-monitoring sessions (Slack listener, Gmail poller) opt into background persistence. User-initiated coding sessions in the Electron UI do not spawn background processes.

**Lifecycle:**
- Electron app spawns the background process on first channel activation
- If the app closes while channels are active, the background process continues
- When the app reopens, it detects the existing process via PID file and reconnects
- The background process shuts down when all channel sessions end or after a configurable idle timeout

**Rejected alternative:** Full WebSocket gateway daemon with launchd/systemd integration. Rejected because: port conflicts, attack surface of network listeners, macOS Gatekeeper issues with unsigned daemons, disproportionate complexity for a desktop app.

**Open design requirement:** Sleep/wake catch-up. When macOS suspends the background process during laptop sleep, it misses inbound messages. On wake, the process must replay missed messages from channel APIs (Slack history, Gmail sync). Each channel adapter must implement a catch-up method.

**Estimated scope:** 2-3 weeks for core process manager, PID lifecycle, reconnection logic.

---

### 2. ChannelAdapter Type (Composed with Sources)

**What:** A typed interface for communication channel integrations, composed with the existing Source system rather than built as a parallel infrastructure.

**Integration with Sources:** `SourceType` extends to `'mcp' | 'api' | 'local' | 'channel'`. `FolderSourceConfig` gains an optional `channel?: ChannelAdapter` field. This reuses existing credential storage, enable/disable toggles, icon management, workspace scoping, and UI rendering in the sources panel.

**Interface (6 fields):**

```typescript
interface ChannelAdapter {
  id: string
  meta: { name: string; icon: string }
  auth: {
    setup(config: ChannelConfig): Promise<Credential>
    validate(credential: Credential): Promise<boolean>
  }
  inbound: {
    connect(): Promise<void>
    disconnect(): Promise<void>
    onMessage(handler: (msg: InboundMessage) => void): void
  }
  outbound: {
    send(message: OutboundMessage, target: string): Promise<void>
  }
  format?: {
    toChannel(agentMessage: string): string
    fromChannel(rawMessage: string): string
  }
}
```

**Why event-emitter inbound (not poll/webhook):** Slack uses Socket Mode (WebSocket). Discord uses a gateway WebSocket. WhatsApp uses long-polling. Gmail uses API polling. The `connect()/disconnect()/onMessage()` pattern covers all transports. Each adapter internalizes its mechanism and emits messages through the same interface. A polling adapter calls `onMessage` internally on each poll tick.

**Rejected alternative:** Full OpenClaw ChannelPlugin contract with 22 adapter interfaces. Rejected because: 17 of 22 adapters would be empty for the initial four channels. The API surface commitment is premature before external plugin authors exist.

**Rejected alternative:** Extending Source types to handle channel semantics directly. Rejected because: Sources are about providing tools and data to the agent. Channels are about bidirectional message flow with external humans. Conflating them creates a type that models nothing well. Composition (Source references ChannelAdapter) preserves both abstractions.

**Estimated scope:** 1-2 weeks for the interface, base types, and Source integration. 1-2 weeks per channel adapter implementation.

---

### 3. Lifecycle Hook System (5 Hooks)

**What:** A hook registry that plugins and internal modules use to intercept agent lifecycle events.

**v0.7.0 hooks:**

| Hook | Purpose | Can Modify? |
|------|---------|-------------|
| `message_received` | Inbound message from a channel | No (read-only notification) |
| `message_sending` | Outbound message before delivery | Yes (modify content, cancel send) |
| `before_tool_call` | Tool invocation about to execute | Yes (block with reason) |
| `after_tool_call` | Tool invocation completed | No (logging/side effects) |
| `session_start` | New session created | No (notification) |

**Implementation:** A `HookRegistry` class storing `Map<HookName, Array<HookHandler>>`. Handlers execute in registration order (no priority system). Simple, debuggable, sufficient for fewer than 5 plugins.

**Relationship to existing code:** The `SessionScopedToolCallbacks` interface in `session-scoped-tools.ts` (`onPlanSubmitted`, `onOAuthBrowserOpen`, etc.) maps to a subset of hooks. The `PreToolUse` and `PostToolUse` hooks in CraftAgent map to `before_tool_call` and `after_tool_call`. The hook system generalizes these existing patterns.

**Rejected alternative:** 13 hooks from OpenClaw (including `before_compaction`, `after_compaction`, `tool_result_persist`, `gateway_start/stop`). Rejected because: those hooks serve OpenClaw's specific needs. Add hooks when concrete use cases demand them.

**Rejected alternative:** Priority-ordered hook dispatch. Rejected because: with fewer than 5 plugins, priority conflicts don't arise. Add priority when needed.

**Estimated scope:** 1 week for the registry, typed events, and integration with CraftAgent.

---

### 4. Bundled Plugin Structure

**What:** Ship first-party plugins (Slack, WhatsApp, Discord, Gmail) as regular imported code, but structured as individual modules in their own directories implementing the ChannelAdapter interface.

**Directory layout:**

```
packages/shared/src/
  channels/
    slack/
      index.ts          # Exports SlackChannelAdapter
      auth.ts
      socket.ts         # Slack Socket Mode connection
      format.ts
    discord/
      index.ts
      auth.ts
      gateway.ts        # Discord gateway WebSocket
      format.ts
    whatsapp/
      index.ts
      auth.ts
      polling.ts
      format.ts
  gmail/
    index.ts            # Standalone module: start/stop/events
    auth.ts
    polling.ts
    types.ts
```

**Why this structure:** Each channel is self-contained in its own directory with a clean export boundary. The layout mirrors what filesystem-discovered plugins would look like, so adding discovery later requires wiring up a directory scan, not refactoring monolithic code.

**Rejected alternative:** Filesystem plugin discovery with manifest scanning. Rejected because: all v0.7.0 plugins are first-party and bundled. No external plugin authors exist yet. Discovery infrastructure is premature.

**Estimated scope:** No additional infrastructure scope (this is an organizational decision, not code).

---

### 5. ChannelSessionResolver

**What:** A focused module (~200 lines) that maps inbound channel messages to Kata sessions. Handles session key derivation, creation, thread mapping, and lifecycle.

**Session key derivation:** `${channelId}:${conversationId}` produces a deterministic key. Example: `slack:C04ABCDEF` for a Slack channel, `whatsapp:5551234567` for a WhatsApp contact.

**Scoping constraints (agreed during debate):**

| Concern | Decision |
|---------|----------|
| Workspace assignment | Channel sessions go into a configurable designated workspace (defaults to active workspace). No auto-created workspaces. |
| Permission mode | Channel sessions start in `safe` mode. Agent can read/respond but not write files. Users upgrade via UI. |
| Thread mapping | Slack: `thread_ts` present = existing session. Top-level messages = new session. Discord: thread ID = session. |
| Session lifecycle | Sessions end after configurable inactivity timeout (default 30 minutes). Session remains in UI for review but stops accepting inbound messages. |
| Cross-channel context | Not addressed in v0.7.0. Each channel creates isolated sessions. Unified context across channels (e.g., same agent via Slack and Electron UI) is a v0.8+ concern. |

**Rejected alternative:** Full OpenClaw routing layer with multi-account resolution, sender allowlists, rate limiting, and group policy enforcement. Rejected because: these are multi-tenant server concerns. Kata is a single-user desktop app.

**Estimated scope:** 1-2 weeks.

---

### 6. Gmail Standalone Module

**What:** Gmail integration as a standalone module at `packages/shared/src/gmail/` with `start()`, `stop()`, and an event emitter for new emails. Not a Source, not a ServicePlugin framework.

**Why standalone (not a Source):** Sources are session-scoped and instantiated per agent session. Gmail polling runs continuously, independent of any session. Composing background polling with the Source model creates a confused type that is sometimes session-scoped and sometimes daemon-scoped.

**Why standalone (not a ServicePlugin):** Building a ServicePlugin framework for one consumer is premature abstraction. When a second background service arrives (calendar, etc.), the pattern is already present in Gmail's implementation to extract.

**Lifecycle:** The background process from component 1 calls `gmail.start()` on boot and `gmail.stop()` on shutdown. Gmail polls the API on an interval, stores sync state in `~/.kata-agents/services/gmail/`, and emits new email events. The ChannelSessionResolver creates sessions for email threads. The agent responds via a registered `send_email` tool.

**Estimated scope:** 2 weeks for Gmail module implementation.

---

## What Was Rejected from the Original Gateway Proposals

| Original Proposal | Disposition | Reason |
|-------------------|-------------|--------|
| WebSocket gateway daemon | Replaced with managed background process | Port conflicts, attack surface, launchd complexity, disproportionate for desktop |
| 22-adapter ChannelPlugin contract | Reduced to 6-field ChannelAdapter | 17 empty adapter slots for 4 channels. Premature API surface commitment. |
| 13 lifecycle hooks | Reduced to 5 | Remaining 8 serve OpenClaw-specific needs. Add when needed. |
| Plugin discovery + hot-reload | Deferred | No external plugin authors in v0.7.0. All plugins are bundled first-party code. |
| Multi-tenant message routing | Replaced with ChannelSessionResolver | Multi-account resolution, sender allowlists, rate limiting are server concerns. |
| ServicePlugin framework | Deferred (Gmail as standalone) | One consumer (Gmail). Extract pattern at second service. |

---

## Estimated Total Scope

| Component | Estimate |
|-----------|----------|
| Managed background process | 2-3 weeks |
| ChannelAdapter type + Source integration | 1-2 weeks |
| Hook system | 1 week |
| ChannelSessionResolver | 1-2 weeks |
| Slack adapter | 1-2 weeks |
| Discord adapter | 1-2 weeks |
| WhatsApp adapter | 1-2 weeks |
| Gmail module | 2 weeks |
| **Total infrastructure** | **5-8 weeks** |
| **Total with all adapters** | **10-16 weeks** |

---

## Open Questions for the Team Lead

1. Is "always-on" a hard requirement for v0.7.0? If not, the managed background process can be deferred, reducing infrastructure scope by 2-3 weeks.
2. Which channels ship first? Shipping all four (Slack, WhatsApp, Discord, Gmail) in one release may be too ambitious. Recommend starting with Slack + Gmail as the reference communication channel and service, then Discord and WhatsApp in a follow-up.
3. Should channel sessions appear in the main session list or in a separate "channels" section of the UI? This affects UI design.
4. How does the agent discover channel-registered tools? Currently, tools come from MCP servers and session-scoped-tools. Channel adapters registering tools (like `send_slack_message`) need to integrate with the existing tool discovery in CraftAgent.
