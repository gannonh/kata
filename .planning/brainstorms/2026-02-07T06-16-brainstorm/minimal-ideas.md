# NanoClaw-Style Minimal Architecture: Proposals

## 1. Single Bun Daemon with Polling Loops

**What:** A single Bun process running as a background daemon alongside Electron. Three polling loops: channel polling (2s for incoming messages from Slack/WhatsApp/Discord), scheduler (60s for scheduled tasks), and Electron IPC watcher (1s for commands from the GUI). The daemon reads/writes to a SQLite database for all persistent state. Electron communicates with the daemon through file-based IPC or a Unix domain socket.

**Why:** NanoClaw proves this pattern works in production with zero reliability issues. A single process eliminates distributed system complexity: no WebSocket reconnection logic, no service discovery, no health monitoring of multiple components. When something goes wrong, there is one log file, one process to debug, one place to look. The polling model replaces event-driven complexity with predictable, testable loops.

**How it maps to Kata Agents:**
- Daemon lives at `packages/daemon/` as a new workspace package
- Electron main process spawns the daemon on app launch (like it already spawns agent subprocesses)
- Daemon reads workspace config from `~/.kata-agents/` (same config directory)
- Electron sends commands via `~/.kata-agents/daemon/ipc/` files (analogous to NanoClaw's `data/ipc/` pattern)
- Daemon state persisted in `~/.kata-agents/daemon/daemon.db` (SQLite)
- Agent execution reuses existing `CraftAgent` from `@craft-agent/shared/agent`

**Scope:** ~2 weeks for core daemon + Electron integration. The daemon itself is ~500 lines (NanoClaw's index.ts is 935 lines and includes WhatsApp-specific logic that wouldn't apply).

**Risks:**
- Polling has inherent latency (2s worst-case for message delivery) vs WebSocket's near-instant
- File-based IPC between Electron and daemon is fragile if either crashes mid-write (NanoClaw handles this with atomic writes but it's still a risk)
- Single process means one channel adapter crash takes down all channels


## 2. Plugin-as-Config: Source-Based Channel Integration

**What:** Instead of a plugin SDK, treat channels as a new source type within Kata's existing source architecture. Add `type: 'channel'` alongside existing `'mcp' | 'api' | 'local'`. Channel sources use the same folder structure (`~/.kata-agents/workspaces/{id}/sources/{slug}/config.json`) with a `channel` config block specifying the adapter type (slack, whatsapp, discord). Enable/disable works exactly like existing sources. No plugin discovery, no dynamic loading, no SDK.

**Why:** Kata already has a full source management system: folder-based config, credential storage, OAuth integration, enable/disable toggle, connection status tracking, and UI for management. Building a separate plugin system duplicates all of this. The source system already supports Google OAuth, Slack OAuth, and Microsoft OAuth. Channel adapters for Slack and Discord just need different API calls against the same OAuth tokens.

**How it maps to Kata Agents:**
- Extend `SourceType` from `'mcp' | 'api' | 'local'` to include `'channel'`
- Add `ChannelSourceConfig` interface in `packages/shared/src/sources/types.ts`
- Channel adapters live in `packages/shared/src/sources/channels/` (slack.ts, discord.ts, whatsapp.ts)
- Each adapter exports `poll()`, `send()`, `connect()`, `disconnect()` functions
- Daemon imports adapters directly (no dynamic loading)
- Source UI already shows enable/disable, connection status, auth state

**Scope:** ~3 days to extend source types + adapt existing OAuth flows. Channel adapters are ~100-200 lines each (the protocol libraries do the heavy lifting).

**Risks:**
- Conflating "data sources" with "communication channels" may cause conceptual confusion
- Source architecture may need changes that affect existing MCP/API sources
- WhatsApp via Baileys requires persistent socket connections, which doesn't fit the source model cleanly


## 3. SQLite-Backed Message Bus

**What:** Replace both session JSONL files and in-memory event routing with a single SQLite database per workspace. All messages (incoming from channels, outgoing from agents, internal commands) flow through the same `messages` table. The daemon writes inbound messages; the agent reads them. Agent responses write back to the same table. The Electron renderer polls or watches the database for UI updates.

**Why:** NanoClaw's SQLite-first approach solves several problems Kata currently handles with multiple systems: session persistence (currently JSONL + persistence-queue), event routing (currently stdout/stderr parsing + IPC), and message history (currently reconstructed from JSONL). A single database provides ACID guarantees, queryability, and crash recovery that JSONL lacks. SQLite's WAL mode supports concurrent readers (Electron) and a single writer (daemon) without contention.

**How it maps to Kata Agents:**
- Add `bun:sqlite` to daemon for message storage
- Schema: `messages(id, workspace_id, session_id, channel, sender, content, timestamp, status)`
- Schema: `tasks(id, workspace_id, prompt, schedule, next_run, status)`
- Daemon writes incoming channel messages to `messages` table
- Agent reads from `messages`, writes responses back
- Electron renderer uses `better-sqlite3` to read messages for display (read-only)
- Replaces `persistence-queue.ts` debounced writes with direct inserts

**Scope:** ~1 week for schema design + migration from JSONL.

**Risks:**
- Migrating existing JSONL sessions to SQLite is a breaking change for existing users
- SQLite file locking between Electron (Node.js/better-sqlite3) and daemon (Bun/bun:sqlite) may have platform-specific issues
- Loses human-readable session files (JSONL can be inspected with text editors)


## 4. Concurrency via GroupQueue Pattern

**What:** Adopt NanoClaw's GroupQueue for managing concurrent agent executions. Instead of unlimited subprocess spawning, cap concurrent agents at a configurable limit (default 5). Queue incoming work by channel/conversation. Each conversation gets exclusive access to its agent (no parallel tool calls on the same conversation). Backoff and retry on failures.

**Why:** NanoClaw's GroupQueue solves real production problems: agents consuming too many resources, race conditions when two messages arrive for the same conversation, and cascade failures when one slow agent blocks everything. Kata's current SessionManager has no concurrency limits. With always-on daemon receiving messages from multiple channels simultaneously, unbounded agent spawning will exhaust system resources.

**How it maps to Kata Agents:**
- Port `GroupQueue` to `packages/shared/src/daemon/queue.ts`
- Integrate with `SessionManager.startSession()` to enforce concurrency limits
- Each channel+conversation combination gets a queue slot
- Daemon uses the queue for all agent invocations (both interactive and channel-triggered)
- Expose queue status in Electron UI (active agents, queued work, retry state)

**Scope:** ~2 days. The GroupQueue is ~300 lines and well-isolated.

**Risks:**
- Queue delay may make interactive sessions feel sluggish (user-initiated chats should bypass the queue or get priority)
- The concurrency limit that works for NanoClaw (server with fixed resources) may be wrong for desktop (variable resources)
- Priority between user-initiated and daemon-triggered agent runs needs careful design


## 5. File-Based IPC Between Daemon and Agents

**What:** Use NanoClaw's file-based IPC pattern for daemon-to-agent communication. Agents write JSON files to a watched directory when they need to send messages or schedule tasks. The daemon polls the directory (1s interval) and processes the files. This replaces the need for WebSocket, HTTP, or stdin/stdout RPC between daemon and agent containers.

**Why:** File-based IPC is the simplest reliable IPC mechanism. It survives crashes (files persist on disk), requires no protocol implementation, works across process boundaries without shared memory, and is trivially debuggable (ls the directory, cat the files). NanoClaw uses per-group IPC namespaces for security isolation, preventing one group's agent from sending messages to another group's chat.

**How it maps to Kata Agents:**
- IPC directory at `~/.kata-agents/daemon/ipc/`
- Subdirectories per workspace: `~/.kata-agents/daemon/ipc/{workspaceId}/`
- Agent writes: `messages/`, `tasks/`, `commands/`
- Daemon reads and deletes processed files
- Electron writes to `commands/` for user-initiated actions
- File format: JSON with type discriminator (`{ "type": "send_message", ... }`)

**Scope:** ~1 day for IPC watcher + file format design.

**Risks:**
- File I/O is slower than in-memory IPC (fine for 1s polling, but not for high-throughput scenarios)
- Directory polling with `readdir` + `stat` has a floor cost that grows with file count (mitigated by deleting processed files)
- Atomic write semantics require write-to-temp-then-rename pattern to avoid partial reads
- No backpressure mechanism (if daemon stalls, IPC directory fills up)


## 6. Launchd/systemd Service Registration

**What:** Register the daemon as a system service via launchd (macOS) or systemd (Linux) so it runs at boot, restarts on crash, and continues running when Electron is closed. The daemon becomes independent of the Electron app lifecycle. Users can configure which channels are active even without the GUI open.

**Why:** For an "always-on assistant," the daemon must survive app restarts and system sleep. NanoClaw uses launchd with `KeepAlive: true` and `RunAtLoad: true`, which means the assistant is available within seconds of login. This transforms Kata from a "tool you open" to a "service that's running." The Electron app becomes a viewer/controller for the daemon, not the daemon itself.

**How it maps to Kata Agents:**
- Plist template at `packages/daemon/launchd/com.kata-agents.daemon.plist`
- Install command: `kata-agents daemon install` (copies plist to `~/Library/LaunchAgents/`)
- Uninstall command: `kata-agents daemon uninstall`
- Electron settings UI shows daemon status (running/stopped) with start/stop controls
- Daemon logs to `~/Library/Logs/kata-agents/daemon.log` (macOS convention)
- Windows: use Task Scheduler or NSSM for equivalent behavior

**Scope:** ~2 days for launchd integration + Electron UI controls.

**Risks:**
- System service adds operational complexity for desktop users who expect "just run the app"
- Daemon running without Electron means users can't see what's happening (no visibility)
- launchd and systemd have different semantics (macOS vs Linux divergence)
- Users may not understand why a process is running after they close the app
- Security implications of an always-running agent that can take actions autonomously
