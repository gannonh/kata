# Hybrid Architecture Ideas: Always-On Daemon + Plugin System

Explorer: explorer-hybrid
Date: 2026-02-07

## Context

The hybrid approach cherry-picks NanoClaw's operational simplicity (single process, SQLite queue, polling loops) with OpenClaw's extensibility model (plugin contract interface, channel abstraction, tool registration). The goal is a daemon that feels as understandable as NanoClaw but can grow like OpenClaw without requiring a rewrite.

---

## Proposal 1: Source-Native Plugin Model

### What
Extend Kata's existing Source abstraction to become the plugin contract. Today, sources are external data connections (MCP, API, local) stored as folder-based configs under `~/.kata-agents/workspaces/{id}/sources/{slug}/`. This proposal adds a new source type `channel` alongside `mcp`, `api`, and `local`. Channel sources implement a simplified adapter interface (from OpenClaw) with just 4 required methods: `connect()`, `poll()`, `send()`, `disconnect()`. The daemon runs as a single Bun process (from NanoClaw) that loads channel sources and runs a polling loop against each.

### Why
Kata already has the infrastructure for discovering, loading, credentialing, and hot-reloading sources via ConfigWatcher. Building plugins as a new source type means zero new discovery/loading/lifecycle code. Users manage plugins through the same UI they use for MCP servers today. The channel adapter keeps the per-plugin contract small enough to understand (NanoClaw philosophy) while being well-typed and extensible (OpenClaw philosophy).

### How it maps to Kata Agents
- `packages/shared/src/sources/types.ts`: Add `'channel'` to `SourceType` union, define `ChannelSourceConfig` with adapter fields
- `packages/shared/src/sources/service.ts`: Channel sources load their adapter module via `import()` from a local `.ts` file in the source folder
- `apps/electron/src/main/sessions.ts` `buildServersFromSources()`: Skip channel sources (they're daemon-only)
- New `packages/shared/src/daemon/`: Single-process event loop that loads channel sources from active workspace, runs poll loops
- `apps/electron/src/main/daemon.ts`: Spawns daemon as Bun subprocess (same pattern as agent sessions)
- ConfigWatcher already fires `onSourcesListChange` / `onSourceChange` -- daemon uses these to hot-add/remove channels

### Scope
Medium. ~2 weeks. Most work is defining the channel adapter interface and writing the daemon event loop. First channel: Slack (uses existing OAuth).

### Risks
- Source abstraction may be too tightly coupled to "data connections" to cleanly absorb messaging channels. A Slack MCP source (read-only data) and a Slack channel (bidirectional messaging) are conceptually different even if they share OAuth.
- Overloading the Source concept could confuse users in the UI -- "why do I have two Slack entries?"
- Channel polling logic needs careful debouncing to avoid rate limits while staying responsive.

---

## Proposal 2: Daemon as Workspace Service with SQLite Queue

### What
Take NanoClaw's core architecture (SQLite message queue, GroupQueue concurrency control, polling scheduler) and port it to Bun as a workspace-scoped service. The daemon process manages a SQLite database at `~/.kata-agents/workspaces/{id}/daemon.db` with tables for inbound messages, outbound messages, and scheduled tasks. Plugins register as "adapters" via a simplified OpenClaw-style contract stored as plugin manifest files in the workspace. The daemon spawns CraftAgent sessions to process queued messages using the existing SessionManager pattern.

### Why
SQLite as a message queue gives crash recovery, inspection, and debugging for free. NanoClaw proved this pattern works for WhatsApp at the scale of personal-use messaging. The workspace scope keeps plugin state isolated between workspaces (a Kata convention). The GroupQueue pattern from NanoClaw provides clean concurrency control -- one agent runs per channel at a time, with pending messages queued.

### How it maps to Kata Agents
- `packages/shared/src/daemon/queue.ts`: Port NanoClaw's `GroupQueue` to Bun, replacing Docker container spawning with CraftAgent session spawning
- `packages/shared/src/daemon/db.ts`: SQLite schema for messages, tasks, plugin state. Use `bun:sqlite` (built into Bun runtime)
- `packages/shared/src/daemon/scheduler.ts`: Port NanoClaw's `TaskScheduler` polling loop for cron/interval tasks
- `apps/electron/src/main/daemon-manager.ts`: Manages daemon lifecycle (start/stop/restart) per workspace, communicates with Electron via IPC
- Plugin manifests at `~/.kata-agents/workspaces/{id}/plugins/{slug}/manifest.json` define adapter entry points
- New IPC channels in `apps/electron/src/main/ipc.ts`: `daemon:status`, `daemon:start`, `daemon:stop`, `daemon:logs`

### Scope
Medium-Large. ~3-4 weeks. SQLite schema design, queue implementation, scheduler, plus first adapter (Gmail or Slack).

### Risks
- SQLite locking under concurrent reads/writes from daemon + Electron processes needs WAL mode and careful connection management.
- Workspace-scoped daemon means switching workspaces could start/stop different daemon instances -- lifecycle complexity.
- NanoClaw's GroupQueue assumes Docker containers; adapting to CraftAgent sessions requires rethinking the isolation model since agents share the host process.

---

## Proposal 3: Thin Plugin Contract with Tool Injection

### What
Define a minimal plugin interface (inspired by OpenClaw's `OpenClawPluginDefinition` but radically simplified) that requires only: `id`, `name`, `register(api)`. The `api` object exposes three registration points: `registerChannel(adapter)` for messaging, `registerTool(tool)` for agent tools, `registerService(service)` for background workers. Plugins are discovered as npm packages or local directories. The daemon process loads plugins, starts their services, and bridges inbound messages to the agent.

From NanoClaw, take the single-process model: all plugins run in the same Bun process. From OpenClaw, take the `registerTool()` pattern so plugins can expose tools to the agent (e.g., a Gmail plugin registers `gmail_send`, `gmail_search` tools alongside its polling service).

### Why
OpenClaw's plugin API has 13+ registration methods (`registerTool`, `registerHook`, `registerHttpHandler`, `registerHttpRoute`, `registerChannel`, `registerGatewayMethod`, `registerCli`, `registerService`, `registerProvider`, `registerCommand`, `on`, etc.). Most of these address concerns Kata doesn't have (gateway, CLI commands, HTTP routes). A 3-method registration API is learnable in minutes. Tool injection is the key OpenClaw pattern worth keeping -- it lets a Gmail plugin both poll for emails AND expose `gmail_send` as an agent tool in the same package.

### How it maps to Kata Agents
- `packages/shared/src/plugins/types.ts`: Define `KataPlugin`, `KataPluginApi`, `ChannelAdapter`, `PluginService`
- `packages/shared/src/plugins/loader.ts`: Discovery and loading (scan `~/.kata-agents/plugins/` directories + workspace `plugins/` folders)
- `packages/shared/src/plugins/registry.ts`: Track loaded plugins, their tools, channels, and services
- `packages/shared/src/agent/craft-agent.ts`: `CraftAgent` constructor accepts additional tools from plugin registry
- `apps/electron/src/main/daemon.ts`: Process that loads plugin registry and runs registered services
- IPC integration: Plugin status exposed via existing IPC pattern (like sources panel in UI)
- Plugin enable/disable stored in `config.json` per workspace (like MCP server toggles)

### Scope
Medium. ~2-3 weeks for core plugin system. Additional 1-2 weeks per channel adapter.

### Risks
- Three registration methods may prove too restrictive. "Just one more" pressure could push toward OpenClaw's complexity over time.
- Plugin code running in the daemon process means a bad plugin can crash the entire daemon. No isolation like NanoClaw's container model.
- Discovery of local directory plugins requires convention over configuration (magic folder names).

---

## Proposal 4: Headless Agent Daemon with Channel Multiplexer

### What
Kata already has `packages/shared/src/headless/` for non-interactive agent execution. This proposal turns that headless mode into the daemon foundation. The daemon runs a single long-lived CraftAgent session in headless mode, with a "channel multiplexer" that aggregates messages from all enabled channels into a unified inbound stream. The agent sees all channels as a single conversation with channel metadata. Outbound messages are routed back through the multiplexer to the correct channel.

From NanoClaw: single-process, single-agent model (one agent handles all channels). From OpenClaw: channel abstraction (normalize different messaging APIs into a common format).

### Why
This is the simplest possible daemon: one agent, one session, one conversation. The agent context accumulates knowledge across channels ("the user mentioned X on Slack, now they're asking about it via WhatsApp"). NanoClaw's per-group model fragments context; this approach preserves it. The channel multiplexer is a thin layer that implements OpenClaw's normalization pattern (each channel adapter converts platform-specific messages to a common `{from, channel, content, timestamp}` format) without the full channel plugin infrastructure.

### How it maps to Kata Agents
- `packages/shared/src/daemon/multiplexer.ts`: Aggregates inbound messages from channel adapters, routes outbound responses
- `packages/shared/src/daemon/adapters/`: Folder of channel adapters (slack.ts, discord.ts, gmail.ts, whatsapp.ts) each implementing `ChannelAdapter` interface
- `packages/shared/src/headless/`: Extend existing headless mode to accept a message stream instead of a single prompt
- `packages/shared/src/agent/craft-agent.ts`: Add `sendToChannel(channelId, message)` as a session-scoped tool
- `apps/electron/src/main/daemon.ts`: Spawns headless agent as Bun subprocess, pipes multiplexer output to agent stdin
- Electron main process receives daemon events via IPC, shows notification badges per channel

### Scope
Small-Medium. ~2 weeks. Leverages existing headless infrastructure.

### Risks
- Single-agent, single-session model will hit context window limits fast if the user is active on multiple channels.
- Agent confusion from interleaved multi-channel messages (Slack message mid-email-draft).
- No parallelism: if the agent is processing a Slack message, Gmail messages queue up. Could feel sluggish.
- Context compaction across channels is tricky -- can't just drop old messages from one channel.

---

## Proposal 5: Daemon-as-launchd with Electron Bridge

### What
Run the daemon as a macOS launchd service (from OpenClaw's deployment model) rather than as an Electron child process. The daemon is a standalone Bun process with its own lifecycle, started via `launchctl` so it survives Electron app restarts, sleep/wake cycles, and login/logout. Communication between daemon and Electron uses a Unix domain socket at `~/.kata-agents/daemon.sock`.

Internally, the daemon uses NanoClaw's architecture: SQLite queue, polling loops, single-process. Plugin discovery uses OpenClaw's manifest model but scoped to workspace plugin directories.

### Why
An Electron child process dies when the app closes. For an "always-on" assistant, the daemon needs independent lifecycle management. launchd is the macOS-native way to run persistent user services. The Unix socket provides a clean, well-defined IPC boundary between daemon and app -- no tight coupling to Electron's process model. This also future-proofs for a potential web/mobile companion (anything that can connect to the socket can drive the daemon).

### How it maps to Kata Agents
- `packages/daemon/`: Standalone package for the daemon process (not coupled to Electron)
- `packages/daemon/src/index.ts`: Main entry point, starts socket server, loads plugins, runs event loops
- `packages/daemon/src/socket-server.ts`: Unix domain socket for IPC (JSON-RPC over socket)
- `apps/electron/src/main/daemon-bridge.ts`: Connects to daemon socket, translates between socket protocol and Electron IPC
- `scripts/install-launchd.ts`: Generates and installs `~/Library/LaunchAgents/com.kata-agents.daemon.plist`
- Daemon auto-starts on login, auto-restarts on crash (launchd KeepAlive)
- On Windows: uses a Windows Service or startup task equivalent

### Scope
Large. ~4-5 weeks. Standalone daemon package, socket protocol, launchd integration, cross-platform lifecycle.

### Risks
- Cross-platform daemon management is complex (launchd on macOS, systemd on Linux, Windows Services/startup tasks on Windows).
- Unix socket adds a serialization/deserialization layer versus in-process communication.
- Users may find daemon management confusing ("why is this process running when I closed the app?").
- Installation/uninstallation of system services requires elevated permissions on some platforms.
- Debugging a daemon that runs independently of the app is harder than debugging a child process.

---

## Proposal 6: Progressive Hybrid -- Start Nano, Grow Open

### What
Ship v0.7.0 with NanoClaw's architecture: single daemon Bun subprocess, SQLite queue, hardcoded channel adapters (Slack, Gmail). No plugin system. Then in v0.8.0, extract the hardcoded adapters into a plugin interface informed by actual usage patterns.

The key insight from NanoClaw is "build the thing first, extract the pattern second." OpenClaw's plugin system was designed upfront with 13 adapter types; many of them exist because they might be needed, not because they are needed. By building 2-3 channels as hardcoded adapters first, we learn which abstraction points are real and which are speculative.

### Why
This avoids the biggest risk of a hybrid approach: designing a plugin interface that doesn't match actual requirements. NanoClaw works because it was built for one use case (WhatsApp) and optimized for that. Starting with hardcoded Slack + Gmail adapters lets us validate the daemon architecture under real usage before committing to an extensibility contract.

The progression is: v0.7.0 = working daemon (NanoClaw pattern), v0.8.0 = extract plugin interface from real adapters (informed by OpenClaw patterns), v0.9.0+ = third-party plugins.

### How it maps to Kata Agents
- v0.7.0: `packages/shared/src/daemon/index.ts` with inline Slack and Gmail adapters
- v0.7.0: `apps/electron/src/main/daemon.ts` spawns daemon subprocess
- v0.7.0: SQLite queue at `~/.kata-agents/workspaces/{id}/daemon.db`
- v0.7.0: Enable/disable channels via workspace config (simple boolean flags)
- v0.8.0: Extract `ChannelAdapter` interface from the 2-3 working adapters
- v0.8.0: Move adapters to `~/.kata-agents/workspaces/{id}/plugins/{slug}/`
- v0.8.0: Add `registerTool()` if agent tool injection proves useful

### Scope
Small for v0.7.0 (~2 weeks). Medium for v0.8.0 extraction (~2 weeks). Total: ~4 weeks spread across two releases.

### Risks
- Hardcoded adapters accumulate tech debt that makes extraction harder (tight coupling to SQLite schema, shared state).
- Users who want Discord or WhatsApp in v0.7.0 must wait for v0.8.0 plugin system.
- "We'll refactor it later" often means "we won't refactor it ever" -- need discipline to actually do the v0.8.0 extraction.
- Two releases means two rounds of testing, migration, and documentation.
