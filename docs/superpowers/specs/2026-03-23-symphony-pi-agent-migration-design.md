# Symphony: Migrate from Codex to pi-coding-agent (Kata RPC)

**Date:** 2026-03-23
**Status:** Draft
**Scope:** Replace Symphony's Codex app-server subprocess bridge with Kata CLI in RPC mode

---

## Problem

Symphony currently spawns `codex app-server` as its agent runtime. This locks it to a single provider (OpenAI Codex) and a single model. The rest of the Kata ecosystem uses `pi-coding-agent` (via the `kata` CLI), which supports Anthropic, OpenAI, Google, Mistral, Bedrock, Azure, and GitHub Copilot. Migrating Symphony to use `kata --mode rpc` as its agent subprocess would:

1. Unify the agent runtime across Kata CLI and Symphony
2. Enable multi-model, multi-provider agent sessions
3. Give Symphony agents access to Kata extensions, skills, and MCP servers

## Architecture

```
Symphony (Rust)                          Kata CLI (Node/TS)
┌─────────────────┐                     ┌──────────────────────┐
│  Orchestrator    │                     │  kata --mode rpc     │
│                  │  stdin (JSON lines) │    --model <m>       │
│  pi_agent::      │ ──────────────────> │    --cwd <workspace> │
│  RpcBridge       │                     │                      │
│                  │ <────────────────── │  AgentSession +      │
│                  │  stdout (JSON lines)│  Extensions + MCP    │
└─────────────────┘                     └──────────────────────┘
```

Each worker spawns one `kata` process per issue. The process lives for the duration of the agent run (potentially multiple prompts/turns). Communication is JSON lines over stdio — the pi RPC protocol.

## Work Streams

### WS1: Kata CLI — Add `--mode rpc` entry point

**What:** Wire `runRpcMode` (already exists in pi-coding-agent) into Kata CLI's argv handling.

**Current state:** `cli.ts` handles `--mode json` and `--mode text` (both routed to `runPrintMode`). There is no `--mode rpc` path.

**Changes to `apps/cli/src/cli.ts`:**

```typescript
// In parseCliFlags, add 'rpc' as a valid mode:
if (val === 'json' || val === 'text' || val === 'rpc') result.mode = val

// In mode routing at bottom:
if (cliFlags.mode === 'rpc') {
  // Apply --model override if provided
  if (cliFlags.model) {
    const match = modelRegistry.getAll().find(
      (m) => `${m.provider}/${m.id}` === cliFlags.model || m.id === cliFlags.model
    )
    if (match) {
      await session.setModel(match)
    }
  }
  // Apply --tools override if provided
  if (cliFlags.tools) {
    const toolNames = cliFlags.tools.split(',').map((t: string) => t.trim()).filter(Boolean)
    if (toolNames.length > 0) {
      session.setActiveToolsByName(toolNames)
    }
  }
  const { runRpcMode } = await import('@mariozechner/pi-coding-agent')
  await runRpcMode(session)
  // runRpcMode returns Promise<never> — keeps process alive
}
```

**New flags to support (passed through to the RPC session):**

| Flag | Purpose |
|------|---------|
| `--mode rpc` | Enter RPC mode |
| `--model <provider/id>` | Set initial model (already exists) |
| `--tools <list>` | Restrict tool set (already exists) |
| `--cwd <path>` | Working directory (needs adding — sets `process.cwd()` before session creation) |
| `--no-session` | Skip session persistence (already exists, useful for ephemeral workers) |
| `--append-system-prompt <file>` | Inject extra system prompt content (already exists) |

**`--cwd` flag:** Currently pi-coding-agent uses `process.cwd()` as the workspace. For Symphony, each agent needs its own workspace directory. Add `--cwd <path>` to Kata CLI that calls `process.chdir(path)` before `createAgentSession`. This must happen early — before `SessionManager.create(process.cwd(), ...)` and `SettingsManager.create(agentDir)`.

**Sizing:** Small. ~30 lines of TypeScript changes in `cli.ts`.

### WS2: Symphony Rust — `pi_agent` protocol adapter

**What:** New Rust module `src/pi_agent/` that replaces `src/codex/` with the same external interface but speaks the pi RPC protocol instead of the Codex JSON-RPC protocol.

#### Module structure

```
src/pi_agent/
  mod.rs              — public re-exports
  rpc_bridge.rs       — subprocess lifecycle + JSON line I/O
  protocol.rs         — pi RPC command/response/event serde types
  token_accounting.rs — token tracking from get_session_stats
```

#### Public interface (same shape as current `codex::app_server`)

```rust
pub struct SessionHandle {
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,
    session_id: String,
    pid: Option<String>,
    // issue metadata for logging
    issue_id: String,
    issue_identifier: String,
    issue_title: String,
    workspace_path: String,
    // config
    read_timeout_ms: u64,
}

pub struct TurnResult {
    pub events: Vec<AgentEvent>,
    pub output_text: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub rate_limits: Option<serde_json::Value>,
}

pub async fn start_session(config, issue, workspace, workspace_root, worker_host) -> Result<SessionHandle>;
pub async fn run_turn(handle, prompt, graphql_executor, event_callback) -> Result<TurnResult>;
pub async fn stop_session(handle) -> Result<()>;
```

The orchestrator's `run_worker_task` and `run_codex_turns_in_session` call these same three functions. The only change in `orchestrator.rs` is which module the functions come from.

#### Protocol mapping

**`start_session`:**

Codex today:
1. Spawn `bash -lc "codex app-server"` with workspace as cwd
2. Send `initialize` JSON-RPC → await response
3. Send `initialized` notification
4. Send `thread/start` → await response (get `thread_id`)

Pi replacement:
1. Spawn `kata --mode rpc --model <model> --cwd <workspace> --no-session` with workspace as cwd
2. Wait for the process to be ready (first line of stdout, or a brief delay)
3. Optionally send `{ "type": "get_state" }` to verify the session is alive
4. Store the `session_id` from the response

The pi RPC process self-initializes on startup — no explicit handshake is needed. The session is ready to receive `prompt` commands as soon as `runRpcMode` calls `session.bindExtensions()`.

**Readiness detection:** After spawn, read stdout lines until we see a `{ "type": "response", "command": "...", ... }` JSON object or a timeout expires. Alternatively, send `get_state` and await its response as a health check. The RPC mode may emit extension UI requests during startup (e.g., `setStatus` from MCP adapter). These should be ignored during handshake.

**`run_turn`:**

Codex today:
1. Send `turn/start` with prompt text → await response (get `turn_id`)
2. Stream JSON lines, dispatching events
3. Wait for `turn/completed` or `turn/failed` notification
4. Extract token deltas from the completion event

Pi replacement:
1. Send `{ "type": "prompt", "id": "<uuid>", "message": "<prompt>" }`
2. Receive `{ "type": "response", "command": "prompt", "success": true }` (ack)
3. Stream `AgentSessionEvent` objects as JSON lines
4. Turn is complete when we receive `{ "type": "agent_end", ... }`
5. After `agent_end`, send `{ "type": "get_session_stats", "id": "<uuid>" }` to get token totals
6. Compute deltas from previous totals

**Event mapping:**

| Pi event | Symphony `AgentEvent` mapping |
|----------|-------------------------------|
| `{ type: "agent_start" }` | Ignored (session-level, not turn-level) |
| `{ type: "turn_start" }` | Log only |
| `{ type: "message_start", message: { role: "assistant" } }` | Log only |
| `{ type: "message_update", ... }` | Optional: stream to TUI |
| `{ type: "tool_execution_start", toolName, args }` | Map to `AgentEvent::Notification` for dashboard |
| `{ type: "tool_execution_end", toolName, result, isError }` | Map to `AgentEvent::Notification` |
| `{ type: "turn_end", message }` | Internal tracking — a pi "turn" is one LLM call + tool loop |
| `{ type: "agent_end", messages }` | → `AgentEvent::TurnCompleted` (the prompt is done) |
| `{ type: "auto_compaction_start" }` | Map to `AgentEvent::Notification` |
| `{ type: "auto_compaction_end" }` | Map to `AgentEvent::Notification` |
| `{ type: "auto_retry_start" }` | Map to `AgentEvent::Notification` |
| `{ type: "extension_ui_request", method: "notify" }` | Map to `AgentEvent::Notification` |
| Other `extension_ui_request` | Auto-respond or ignore (see Extension UI section) |

**Key difference — turn semantics:**

In Codex, a "turn" is explicitly bounded (`turn/start` → `turn/completed`). Symphony runs multiple turns per session, checking Linear issue state between turns.

In pi RPC, a `prompt` command triggers the full agent loop: the LLM generates a response, calls tools, sees tool results, generates another response, calls more tools, etc. — until the LLM produces a final response with no tool calls. This entire sequence is one "prompt" from Symphony's perspective. Pi emits multiple `turn_start`/`turn_end` events within a single prompt (one per LLM call), but the completion signal is `agent_end`.

**Mapping to Symphony's multi-turn model:**

Symphony's turn loop (`run_codex_turns_in_session`) sends an initial prompt on turn 1, then continuation prompts on turns 2+. With pi RPC:

- **Turn 1:** Send `{ "type": "prompt", "message": "<rendered template>" }` → wait for `agent_end`
- **Between turns:** Check Linear issue state (same as today)
- **Turn 2+:** Send `{ "type": "prompt", "message": "<continuation guidance>" }` → wait for `agent_end`

This maps naturally. The pi session persists across prompts (conversation history, tool state, extensions). Each `prompt` command adds a user message and runs the agent loop to completion.

**`stop_session`:**

Codex today: Kill the subprocess.

Pi replacement:
1. Send `{ "type": "abort" }` if a prompt is in flight
2. Close stdin
3. Wait briefly for graceful exit
4. Kill the subprocess if still alive

#### Extension UI handling

The pi RPC mode emits `extension_ui_request` events when extensions need user input (e.g., MCP OAuth, extension selection dialogs). Symphony is non-interactive, so these need deterministic handling:

| Request method | Symphony response |
|----------------|-------------------|
| `select` | Respond with `{ "type": "extension_ui_response", "id": "...", "cancelled": true }` |
| `confirm` | Respond with `{ "type": "extension_ui_response", "id": "...", "confirmed": false }` |
| `input` | Respond with `{ "type": "extension_ui_response", "id": "...", "cancelled": true }` |
| `editor` | Respond with `{ "type": "extension_ui_response", "id": "...", "cancelled": true }` |
| `notify` | Ignore (fire-and-forget, no response needed) |
| `setStatus` | Ignore |
| `setWidget` | Ignore |
| `setTitle` | Ignore |
| `set_editor_text` | Ignore |

This matches the pattern Codex uses with `NON_INTERACTIVE_ANSWER` — Symphony auto-declines interactive requests.

#### Token accounting

Codex embeds token deltas in each `turn/completed` event. Pi doesn't include per-event token counts in the same way. Instead:

1. After each `agent_end`, send `get_session_stats` command
2. The response contains cumulative `tokens: { input, output, cacheRead, cacheWrite, total }`
3. Compute deltas by subtracting previous cumulative values
4. Map to `TurnResult.input_tokens`, `output_tokens`, `total_tokens`

Rate limit info: Pi doesn't surface provider rate limits through the RPC protocol. The `rate_limits` field in `TurnResult` will be `None` for pi-based sessions. If rate limiting becomes important, it can be added to pi's event stream later.

#### Stall detection

Symphony detects stalled workers by tracking `last_activity_ms` per session. With Codex, any event updates this timestamp. The same approach works with pi — any JSON line from stdout (events, responses) updates the last-activity timestamp. The `stall_timeout_ms` config applies unchanged.

#### SSH remote workers

SSH workers spawn commands via `ssh -T host bash -lc '<command>'`. Currently the command is the Codex binary. For pi, it becomes:

```
kata --mode rpc --model <model> --cwd <workspace> --no-session
```

The remote host must have `kata` (or a compatible pi-coding-agent binary) installed and on `PATH`. The SSH transport is unchanged — it's still stdio over SSH.

#### GraphQL executor (dynamic tools)

Codex supports "dynamic tools" where the agent can execute arbitrary GraphQL queries against Linear. This is implemented in `src/codex/dynamic_tool.rs` and wired into `run_turn` via a callback.

With pi, this capability comes for free — Kata CLI ships with the built-in Linear extension (`linear_*` tools) and MCP support. If the agent's environment has `LINEAR_API_KEY` set, it can use Linear tools directly. The explicit GraphQL executor callback in `run_turn` can be dropped.

**Action:** Remove the `graphql_executor` parameter from `run_turn`. The agent handles Linear interaction through its own tools.

### WS3: WORKFLOW.md config changes

**What:** Evolve the config schema to support the pi agent backend while maintaining backward compatibility with Codex.

#### New `agent` section (replaces/extends `codex`)

```yaml
agent:
  # Existing fields (from codex section)
  max_concurrent_agents: 10
  max_turns: 20
  max_retry_backoff_ms: 300000
  max_concurrent_agents_by_state: {}

  # New: backend selection
  backend: pi                    # "pi" (default, new) or "codex" (legacy)

  # New: pi-specific config
  command: kata --mode rpc       # Command to spawn (default: "kata --mode rpc")
  model: anthropic/claude-sonnet-4-6  # Model for agent sessions
  no_session: true               # Skip session persistence (default: true)
  append_system_prompt: null     # Optional file path for extra system prompt

  # Existing codex-specific config (only used when backend: codex)
  codex_command: codex app-server
  approval_policy: {}
  thread_sandbox: workspace-write
  turn_sandbox_policy: null
  turn_timeout_ms: 3600000
  read_timeout_ms: 5000
  stall_timeout_ms: 300000
```

**Backward compatibility:** If the YAML has a `codex` section and no `agent.backend` field, default to `backend: "codex"`. If `agent.backend: "pi"` or the `codex` section is absent, use the pi backend.

The existing `codex` section fields (`approval_policy`, `thread_sandbox`, `turn_sandbox_policy`, `turn_timeout_ms`, `read_timeout_ms`) are Codex-specific and not used by the pi backend. The shared fields (`stall_timeout_ms`, `max_turns`) move to `agent` level.

#### Model per-issue override (future)

The `model` field in `agent` sets the default. A future enhancement could allow per-issue model selection (e.g., via Linear labels or issue fields). This is out of scope for the initial migration.

### WS4: Orchestrator wiring

**What:** Minimal changes to `orchestrator.rs` to use the new `pi_agent` module.

**Changes:**

1. Import `pi_agent` instead of `codex::app_server` (or conditionally based on `backend` config)
2. Remove `graphql_executor` parameter from `run_codex_turns_in_session` (now `run_agent_turns_in_session`)
3. Pass model config through `WorkerTaskConfig`
4. The rest of the orchestrator (retry logic, scheduling, reconciliation, stall detection, TUI, HTTP dashboard) is unchanged

**Conditional backend (transition period):**

```rust
match config.agent_backend {
    AgentBackend::Pi => {
        let session = pi_agent::start_session(&pi_config, issue, workspace, workspace_root, worker_host).await?;
        // ...
    }
    AgentBackend::Codex => {
        let session = app_server::start_session(&codex_config, issue, workspace, workspace_root, worker_host).await?;
        // ...
    }
}
```

This can be simplified by extracting a trait, but given the small surface (3 functions), a match statement is simpler and more explicit.

## Non-goals

- **Embedding Node.js in the Rust process.** The subprocess boundary is the right abstraction.
- **Custom provider integration in Symphony.** Provider config lives in pi-ai; Symphony just passes `--model`.
- **Session persistence across restarts.** Symphony workers are ephemeral. `--no-session` skips persistence.
- **MCP server management from Symphony.** MCP config lives in `~/.kata-cli/agent/mcp.json` and is managed by the operator, not Symphony.
- **Rate limit propagation.** Pi doesn't surface provider rate limits via RPC. If needed later, add to pi's event stream.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pi RPC startup time slower than Codex | Longer time-to-first-turn | Measure; optimize Kata CLI startup path if needed (lazy extension loading) |
| Extension UI requests blocking | Agent hangs waiting for interactive input | Auto-decline all interactive requests (see Extension UI section) |
| Token accounting less granular | Dashboard token display less accurate | `get_session_stats` after each prompt gives accurate cumulative; deltas are reliable |
| `kata` binary not on remote SSH hosts | SSH workers fail | Document requirement; add validation in `start_session` |
| Compaction resets context | Multi-turn continuation loses prior work | Pi's auto-compaction preserves a summary; the continuation prompt is re-injected as a new user message |

## Migration sequence

1. **WS1:** Add `--mode rpc` to Kata CLI (unblocks everything else)
2. **WS2:** Build `src/pi_agent/` module with protocol types, bridge, and token accounting
3. **WS3:** Add `agent.backend` config parsing to `workflow.rs` / `config.rs`
4. **WS4:** Wire orchestrator to conditionally use pi or codex backend
5. **Test:** Run Symphony with `backend: pi` against a real Linear project
6. **Default flip:** Change default backend from `codex` to `pi`
7. **Cleanup:** Remove Codex backend code once stable (separate milestone)

## Testing strategy

- **Unit tests:** Protocol serde types (parse pi events, serialize commands)
- **Integration tests:** Mock subprocess that emits canned pi RPC responses; verify `start_session`/`run_turn`/`stop_session` lifecycle
- **E2E:** Run Symphony against a test Linear project with `backend: pi` and a real `kata` binary
- **Backward compat:** Verify `backend: codex` still works with existing WORKFLOW.md files
