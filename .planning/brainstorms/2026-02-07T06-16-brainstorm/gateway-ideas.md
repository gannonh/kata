# Gateway Architecture Proposals for Kata Agents v0.7.0

Explorer: OpenClaw-style gateway with plugin SDK

---

## Proposal 1: WebSocket Gateway Daemon

**What:** A long-running daemon process separate from Electron, listening on `ws://127.0.0.1:<port>`. The Electron app connects as a client. External plugins, CLI tools, and mobile apps can also connect. The daemon owns all agent execution, plugin lifecycle, and channel routing.

**Why (strategic justification):**
- Decouples agent execution from the Electron window lifecycle. The agent keeps working when the app is closed or restarted.
- Establishes a protocol that future clients (web UI, mobile, CLI) can share without reimplementing agent management.
- OpenClaw proves this pattern scales to 13+ channels and hundreds of concurrent sessions. Starting with the gateway architecture avoids a painful migration later.
- WebSocket gives bidirectional streaming with lower overhead than HTTP polling, and Bun's native WebSocket support makes this trivial.

**How it maps to Kata Agents:**
- The existing `SessionManager` moves from Electron main process into the daemon. The main process becomes a thin IPC bridge: renderer <-> IPC <-> WebSocket <-> daemon.
- `~/.kata-agents/` config directory stays the same; the daemon reads it directly.
- Daemon runs as a launchd service on macOS (or user-level background process). Electron spawns it on first launch if not running, connects to it, and keeps working if the daemon was already alive.
- Agent events currently streamed via stdout/stderr get routed through WebSocket frames instead.

**Scope:** Large. 3-4 weeks for core daemon + WebSocket protocol + Electron client migration. Additional 1-2 weeks for launchd integration and crash recovery.

**Risks:**
- Significant rearchitecture of the main process. Every IPC handler that touches sessions needs to proxy through WebSocket.
- Two processes to debug instead of one. Crash in the daemon is harder for users to diagnose than a crash in Electron.
- Port conflicts on user machines. Need fallback port discovery.
- macOS security: unsigned daemons may trigger Gatekeeper warnings or require notarization separately from the Electron app.

---

## Proposal 2: Full Plugin SDK with ChannelPlugin Contract

**What:** A typed plugin SDK modeled on OpenClaw's `ChannelPlugin` contract. Each communication channel (Slack, WhatsApp, Discord) implements a standardized set of adapters: `config`, `setup`, `auth`, `outbound`, `messaging`, `heartbeat`, `directory`, `security`, `threading`, `status`. Plugins register themselves via `registerChannel()` on a `KataPluginApi` object.

**Why:**
- Channel adapters enforce a uniform contract. Adding a new channel (e.g., Telegram, Signal) becomes filling in adapter implementations rather than building bespoke integration code.
- The adapter decomposition separates concerns: auth logic stays in the auth adapter, message formatting in the messaging adapter. Each can be tested independently.
- OpenClaw's contract has been battle-tested across Slack, Discord, WhatsApp, Telegram, Signal, iMessage, LINE, Feishu, Google Chat, and MS Teams. Adopting a proven interface saves design iteration.
- The plugin SDK enables community contributions. Third-party developers write a `ChannelPlugin`, drop it in `~/.kata-agents/extensions/`, and it works.

**How it maps to Kata Agents:**
- Kata already has the concept of "sources" (MCP, API, local, gmail). Channels become a new source type: `channel`. The existing `LoadedSource` type extends with channel metadata.
- Plugin discovery follows OpenClaw's pattern: scan `~/.kata-agents/extensions/` for directories containing a `kata-plugin.json` manifest (or `package.json` with a `kata-agents` field). Load via Bun's dynamic import.
- The `KataPluginApi` mirrors OpenClaw's `OpenClawPluginApi`: `registerTool()`, `registerHook()`, `registerChannel()`, `registerService()`, `registerCommand()`.
- Channel plugins get access to the agent via session-scoped tools. A Slack plugin registers a `send_slack_message` tool that the agent can invoke.

**Scope:** Large. 2-3 weeks for the SDK core, plugin loader, and discovery. Each channel adapter takes 1-2 weeks depending on API complexity. The SDK itself is reusable infrastructure that amortizes across all future plugins.

**Risks:**
- Over-engineering for four initial plugins. The full ChannelPlugin contract has 15+ adapter interfaces; Slack, WhatsApp, and Discord may only need 4-5 of them.
- Plugin isolation: a crashing plugin can take down the daemon if loaded in-process. Need process isolation or at minimum crash boundaries.
- API surface maintenance: every public type in the SDK is a compatibility commitment. Breaking changes affect all plugin authors.

---

## Proposal 3: Plugin Lifecycle Hooks

**What:** A hook system modeled on OpenClaw's `PluginHookHandlerMap`. Plugins register handlers for lifecycle events: `before_agent_start`, `agent_end`, `message_received`, `message_sending`, `message_sent`, `before_tool_call`, `after_tool_call`, `session_start`, `session_end`, `gateway_start`, `gateway_stop`. Hooks run in priority order and can modify event payloads (e.g., `message_sending` can alter or cancel outbound messages).

**Why:**
- Hooks give plugins fine-grained control without modifying core code. A logging plugin, a content filter, or a rate limiter all attach via hooks.
- OpenClaw's hook system supports both synchronous transforms (e.g., modify a message before sending) and async side effects (e.g., log to external service after tool call). This flexibility covers most plugin use cases.
- Kata already has a callback pattern in `session-scoped-tools.ts` (`onPlanSubmitted`, `onOAuthBrowserOpen`, etc.). Hooks generalize this pattern into a formal API.

**How it maps to Kata Agents:**
- The existing `SessionScopedToolCallbacks` interface maps directly to a subset of hooks. `onPlanSubmitted` becomes a handler on the `plan_submitted` hook.
- `CraftAgent`'s `PreToolUse` and `PostToolUse` hooks in the Claude Agent SDK map to `before_tool_call` and `after_tool_call` plugin hooks. The agent runs its internal hook first, then fires plugin hooks.
- The `ConfigWatcher` already watches for file changes and fires callbacks. The hook system can subscribe to `config_change` events via the same mechanism.
- Implementation: a `HookRegistry` class that stores `Map<HookName, Array<{handler, priority, pluginId}>>`, with `emit(hookName, event, context)` that runs handlers in priority order.

**Scope:** Medium. 1-2 weeks for the hook registry, typed event definitions, and integration with CraftAgent. Additional 1 week per hook consumer (plugin that uses hooks).

**Risks:**
- Hook ordering bugs. When multiple plugins register for the same hook at different priorities, the interaction matrix grows quickly.
- Performance: synchronous hooks in the message path add latency. Need to measure impact of hook dispatch on agent response times.
- Debugging: a hook that silently modifies a message payload creates invisible mutation. Need good logging/tracing for hook execution.

---

## Proposal 4: Plugin Discovery and Hot-Reload

**What:** Adopt OpenClaw's plugin discovery mechanism: scan multiple directories for plugin candidates (bundled, global `~/.kata-agents/extensions/`, workspace-level), load them via dynamic import, validate their manifests, and support hot-reload when plugin files change. Plugins declare themselves via `package.json` with a `kata-agents.extensions` field or a standalone `kata-plugin.json` manifest.

**Why:**
- Standardized discovery eliminates manual configuration for installing plugins. Drop a directory into `extensions/`, restart the daemon, and the plugin loads.
- Hot-reload enables development workflow: edit a plugin, save, see changes without restarting the daemon. OpenClaw's `config-reload.ts` demonstrates this pattern with file watchers and graceful teardown/re-init.
- Multi-origin loading (bundled + global + workspace) lets Kata ship first-party plugins (Slack, Gmail) bundled while supporting user-installed and workspace-scoped plugins.
- The existing `ConfigWatcher` in Kata already watches filesystem paths. Extending it to watch the extensions directory is low incremental effort.

**How it maps to Kata Agents:**
- Bundled plugins ship inside the Electron app bundle (via esbuild), loaded from `__dirname/extensions/`.
- Global plugins installed at `~/.kata-agents/extensions/`. User downloads or `git clone`s plugins here.
- Workspace plugins at `~/.kata-agents/workspaces/{id}/extensions/` for workspace-specific integrations.
- Discovery follows OpenClaw's algorithm: scan directory entries, check for `package.json` with extensions field or index.ts/index.js, resolve entrypoints, deduplicate by resolved path.
- Loading via `Bun.import()` or dynamic `import()`. Plugin modules export a `KataPluginDefinition` or a function `(api: KataPluginApi) => void`.

**Scope:** Medium. 1-2 weeks for discovery + loader + manifest validation. Hot-reload adds another 1 week.

**Risks:**
- Security: loading arbitrary code from the filesystem is a supply chain risk. Need to consider code signing, manifest validation, or at minimum a trust-on-first-use prompt.
- Bun vs Node.js module loading: Electron main process runs Node.js, but the daemon could run Bun. Need to ensure dynamic imports work consistently across both runtimes.
- Hot-reload reliability: partial reload states (old adapter still registered, new adapter fails to load) create inconsistent behavior. Need atomic swap with rollback.

---

## Proposal 5: Unified Message Routing with Session Key Derivation

**What:** A routing layer that maps inbound messages from any channel to the correct agent session. Inspired by OpenClaw's `server-session-key.ts` which derives session keys from channel ID, account ID, conversation ID, and sender identity. The router maintains a mapping of external conversations to Kata sessions, creating new sessions on first contact and resuming existing sessions for returning conversations.

**Why:**
- Without routing, each channel plugin would independently manage session mapping, leading to duplicated logic and inconsistent behavior.
- Session key derivation creates a deterministic, collision-free identifier: `slack:workspace123:channel456` always maps to the same Kata session. This enables conversation continuity across daemon restarts.
- OpenClaw's routing handles groups, DMs, threads, and multi-account scenarios. Adopting this pattern means Kata handles these cases from day one instead of discovering edge cases in production.
- The router also serves as the enforcement point for policies: which senders are allowed, which channels are active, rate limiting.

**How it maps to Kata Agents:**
- Kata's existing session model (`Session` type with `id`, `workspaceId`, `messages`) extends with `channelId` and `externalConversationId` fields for channel-originated sessions.
- The router sits between channel plugins and `SessionManager`. When a Slack message arrives, the router computes the session key, looks up or creates a session, and dispatches the message.
- Existing workspace-based session persistence (JSONL files in `~/.kata-agents/workspaces/{id}/sessions/`) continues to work. Channel sessions get their own namespace within the workspace.
- Agent responses route back through the channel plugin's `outbound` adapter to send replies.

**Scope:** Medium. 2-3 weeks for the router, session key derivation, conversation state tracking, and policy enforcement.

**Risks:**
- Session proliferation: each new Slack DM or group thread creates a session. Need session cleanup policies.
- State synchronization: if a user interacts with the same agent through both the Electron UI and Slack, they may expect unified context. Merging contexts across channels is unsolved.
- Key collisions: poorly designed session keys could map different conversations to the same session. Need thorough test coverage.

---

## Proposal 6: Service Plugin Architecture for Non-Channel Integrations

**What:** A `ServicePlugin` type for integrations that aren't messaging channels but provide ongoing background functionality. Modeled on OpenClaw's `OpenClawPluginService` with `start()` and `stop()` lifecycle methods and access to a state directory. Gmail polling, calendar sync, food delivery monitoring, and home automation all fit this model.

**Why:**
- Communication channels and background services have fundamentally different lifecycles. Channels process inbound/outbound messages. Services perform periodic work, react to webhooks, or maintain long-lived connections. A separate plugin type makes this distinction explicit.
- OpenClaw treats services as first-class plugins with their own state directories. This isolation means a Gmail service can store its sync cursor without polluting the main config.
- Kata already has the concept of source types (mcp, api, local, gmail). Service plugins formalize the "gmail" source type into a general-purpose pattern.
- The agent gains capabilities through service-registered tools. A Gmail service registers `read_email`, `send_email`, `search_emails` tools. A calendar service registers `check_schedule`, `create_event`. The agent discovers these tools dynamically.

**How it maps to Kata Agents:**
- `ServicePlugin` implements `{ id: string, start(ctx), stop(ctx) }`. The `ctx` provides config, workspace directory, a state directory at `~/.kata-agents/services/{pluginId}/`, and a logger.
- The daemon manages service lifecycle: starts enabled services on boot, stops them on shutdown, restarts on crash with exponential backoff.
- Services register agent tools via the `KataPluginApi.registerTool()` method. Tools appear in the agent's tool palette alongside MCP tools.
- The Electron UI shows service status in the sources panel. Users enable/disable services per workspace.
- Gmail becomes the reference implementation: polls the Gmail API, stores sync state in its state directory, registers email tools for the agent.

**Scope:** Medium. 1-2 weeks for the service plugin contract and lifecycle manager. Each service implementation takes 1-2 weeks. Gmail reference implementation: 2 weeks.

**Risks:**
- Resource consumption: background services consume memory, CPU, and API quota even when the user isn't actively working. Need resource budgets and idle detection.
- Error handling: a service that crashes in a loop will burn API credits and fill logs. Exponential backoff with circuit breaker is the minimum.
- OAuth token refresh: services need long-lived access. OAuth tokens expire. The credential manager must handle refresh automatically for service plugins.
- Scope creep: every "wouldn't it be cool if" idea maps to a service plugin. Need discipline about which services to build versus which to leave for community.
