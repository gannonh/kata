# Brainstorm Summary: Always-On Daemon Architecture for Kata Agents v0.7.0

**Date:** 2026-02-07
**Teams:** 3 explorer/challenger pairs, 3 rounds of debate each
**Topic:** Best architectural approach for adding an always-on daemon with plugin support

## Approach Comparison

| Dimension | Minimal | Gateway | Hybrid |
|-----------|---------|---------|--------|
| **Process model** | Bun subprocess of Electron | Managed background process (persists after app close) | Bun subprocess of Electron |
| **Plugin model** | No plugins; channel config block on existing Sources | 6-field ChannelAdapter composed with Sources | Plugin contract with 3 registration methods |
| **Channel interface** | Two interfaces: PollAdapter + StreamAdapter | Single ChannelAdapter with event-emitter inbound | Single ChannelAdapter with dual ingress (poll/subscribe) |
| **State storage** | SQLite (daemon-only) | SQLite implied | SQLite (daemon-only, IPC queries from Electron) |
| **Permission model** | Existing `safe` mode default | Existing `safe` mode default | New `daemon` permission mode with explicit tool allowlist |
| **Session model** | Not detailed | Per-conversation via ChannelSessionResolver | Per-channel CraftAgent sessions with compaction |
| **Hook system** | None | 5 lifecycle hooks | Not explicit (tool injection via registerTool) |
| **Gmail approach** | Deferred to v0.8.0 | Standalone module (not a plugin) | Plugin via registerService |
| **Scope estimate** | ~3-4 weeks | 10-16 weeks (5-8 infra + adapters) | ~5-6 weeks |
| **Channels in v0.7.0** | Slack, Discord, WhatsApp | Slack, Discord, WhatsApp, Gmail | Slack, Gmail (then Discord, WhatsApp) |

## Convergence Points (All Three Teams Agreed)

1. **Bun subprocess, not a WebSocket gateway.** All teams rejected the full WebSocket daemon. The daemon is a Bun child process of Electron, communicating via stdin/stdout JSON lines. No network listeners, no port conflicts, no attack surface.

2. **SQLite for daemon state.** All teams adopted SQLite for message queuing and task scheduling. Only the daemon writes; Electron reads via IPC (hybrid) or WAL mode (minimal).

3. **launchd/systemd deferred.** Always-on independence from Electron requires solving the headless permission problem first. All teams deferred this to v0.8.0 or later.

4. **First-party plugins only.** No plugin discovery, no dynamic loading, no third-party ecosystem in v0.7.0. All channel implementations are bundled code.

5. **Dual channel paradigm.** Polling channels (Gmail, Slack Web API) and persistent-connection channels (Discord, WhatsApp) need different ingress patterns. All teams acknowledged this with poll/stream or poll/subscribe splits.

6. **Compose with existing Source infrastructure.** Channels reuse existing credential management, OAuth flows, enable/disable toggles, and workspace scoping rather than building parallel systems.

7. **Concurrency control for daemon sessions.** Cap concurrent daemon-triggered agent sessions (3-5) while leaving interactive sessions uncapped.

## Key Divergences

### Plugin abstraction level
- **Minimal:** No plugin abstraction. Channels are config blocks on Sources. Adapters are internal implementation.
- **Gateway:** ChannelAdapter type composed with Sources. Hook system for lifecycle events. No formal plugin contract.
- **Hybrid:** Full KataPlugin interface with registerChannel/registerTool/registerService. Thin but real plugin SDK.

**Trade-off:** Minimal ships fastest but has no extension path. Hybrid ships a plugin contract that can evolve. Gateway's hook system adds capability but more surface area.

### Permission model
- **Minimal/Gateway:** Reuse existing `safe` permission mode for daemon sessions.
- **Hybrid:** New `daemon` permission mode with explicit tool allowlist, separate from the existing three modes.

**Trade-off:** A dedicated daemon mode is more secure and granular. Reusing `safe` mode is simpler but may be too restrictive (blocks tools that daemon channels legitimately need) or require upgrading to `ask` mode (which prompts the user, defeating the purpose of always-on).

### Gmail inclusion
- **Minimal:** Gmail deferred to v0.8.0 (service plugins are a different model from communication channels).
- **Gateway:** Gmail as standalone module, separate from the channel system.
- **Hybrid:** Gmail as first plugin via registerService, proving the service registration path.

### Session management
- **Minimal:** DaemonQueue with per-conversation exclusive access. Session details not deeply specified.
- **Gateway:** ChannelSessionResolver with deterministic key derivation, thread mapping, 30-minute timeout.
- **Hybrid:** Per-channel CraftAgent sessions with compaction. One persistent session per active channel.

**Trade-off:** Per-conversation sessions (minimal/gateway) provide isolation but create many sessions. Per-channel sessions (hybrid) are more resource-efficient but mix conversation contexts within a channel.

## Recommendation

The **hybrid approach** provides the best balance for v0.7.0:

1. **It ships a plugin contract** without over-building. Three registration methods (channel, tool, service) cover the known use cases. The contract can evolve without breaking changes.

2. **The dual ingress pattern** (poll/subscribe on ChannelAdapter) is the cleanest interface across teams. It acknowledges the paradigm split without forcing two separate adapter types.

3. **The `daemon` permission mode** is the right call. An always-on daemon processing external messages through an AI agent needs a purpose-built security boundary, not a repurposed interactive mode.

4. **Per-channel sessions with compaction** is a pragmatic default. If it proves too expensive, downgrade to stateless per-message processing without changing the plugin interface.

5. **Estimated 5-6 weeks** sits between minimal (3-4 weeks, less capability) and gateway (10-16 weeks, over-engineered). Reasonable for a significant new capability.

**Borrow from the minimal report:**
- Source-based channel config (channel block on FolderSourceConfig) instead of a new SourceType
- DaemonQueue concurrency pattern for daemon-triggered sessions
- The "75% already exists" framing for scope management

**Borrow from the gateway report:**
- ChannelSessionResolver for deterministic session key derivation and thread mapping
- Sleep/wake catch-up requirement for channel adapters
- Structured error signaling (PollResult discriminated union with ChannelError codes)

## Deferred Items (All Teams)

| Item | Deferred To | Reason |
|------|-------------|--------|
| launchd/systemd service | v0.8.0+ | Requires headless permission model |
| Third-party plugin discovery | v0.8.0+ | No external plugin authors yet |
| Cross-channel unified context | v0.8.0+ | Each channel isolated for now |
| Plugin isolation (worker threads) | v0.9.0+ | First-party plugins are trusted |
| JSONL-to-SQLite session migration | Separate project | No dependency on daemon |

## Cross-Cutting Themes

1. **The existing codebase does more than expected.** All teams found that Source management, OAuth, credential storage, and workspace scoping already handle 60-75% of what the daemon needs. The new work is the daemon process itself and channel-specific adapters.

2. **Desktop constraints differ from server constraints.** Sleep/wake, single user, lightweight resource budget, no port listeners. Every team had to pare back server-oriented patterns from the reference implementations.

3. **The permission problem is the hardest unsolved piece.** How does an always-on AI agent get approval to act when the user isn't looking? All teams punted this to v0.8.0 with restrictive defaults for v0.7.0.

4. **Channel adapter quality is the real risk.** The architecture is secondary to whether Baileys (WhatsApp) stays stable, whether Slack's Socket Mode is reliable, whether Gmail's API quota is sufficient. These are runtime risks, not design risks.

## Full Reports

- [Minimal architecture report](minimal-report.md) (NanoClaw-style)
- [Gateway architecture report](gateway-report.md) (OpenClaw-style)
- [Hybrid architecture report](hybrid-report.md) (Combined approach)

Raw proposals: [minimal-ideas.md](minimal-ideas.md) | [gateway-ideas.md](gateway-ideas.md) | [hybrid-ideas.md](hybrid-ideas.md)
