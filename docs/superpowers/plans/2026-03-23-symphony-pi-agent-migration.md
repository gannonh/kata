# Symphony pi-agent Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Symphony's Codex app-server subprocess bridge with Kata CLI in RPC mode, enabling multi-model agent sessions.

**Architecture:** Symphony spawns `kata --mode rpc --model <model> --cwd <workspace>` as a subprocess instead of `codex app-server`. A new `src/pi_agent/` Rust module speaks the pi RPC JSON-line protocol. Config adds `agent.backend: pi|codex` for a transition period.

**Tech Stack:** Rust (Symphony), TypeScript (Kata CLI), pi-coding-agent RPC protocol (JSON lines over stdio)

**Spec:** `docs/superpowers/specs/2026-03-23-symphony-pi-agent-migration-design.md`

---

## File Structure

### Kata CLI (TypeScript)
- **Modify:** `apps/cli/src/cli.ts` — Add `--mode rpc` and `--cwd` flag handling

### Symphony (Rust) — New modules
- **Create:** `apps/symphony/src/pi_agent/mod.rs` — Module re-exports
- **Create:** `apps/symphony/src/pi_agent/protocol.rs` — Pi RPC serde types (commands, responses, events)
- **Create:** `apps/symphony/src/pi_agent/rpc_bridge.rs` — Subprocess lifecycle, JSON line I/O, session/turn management
- **Create:** `apps/symphony/src/pi_agent/token_accounting.rs` — Token delta tracking via `get_session_stats`

### Symphony (Rust) — Modified modules
- **Modify:** `apps/symphony/src/lib.rs` — Add `pub mod pi_agent;`
- **Modify:** `apps/symphony/src/domain.rs` — Add `PiAgentConfig` struct, `AgentBackend` enum, extend `ServiceConfig`
- **Modify:** `apps/symphony/src/config.rs` — Parse `pi_agent` YAML section, resolve `agent.backend`
- **Modify:** `apps/symphony/src/orchestrator.rs` — Conditional dispatch to pi_agent or codex backend
- **Modify:** `apps/symphony/docs/WORKFLOW-REFERENCE.md` — Document new config fields

### Symphony (Rust) — Tests
- **Create:** `apps/symphony/tests/pi_agent_tests.rs` — Protocol serde, bridge lifecycle, token accounting
- **Modify:** `apps/symphony/tests/workflow_config_tests.rs` — Config parsing for new fields

---

## Task 1: Add `--mode rpc` and `--cwd` to Kata CLI

**Files:**
- Modify: `apps/cli/src/cli.ts`

- [ ] **Step 1: Add `rpc` to mode validation and `cwd` flag parsing**

In `apps/cli/src/cli.ts`, find the `parseCliFlags` function. Make two changes:

1. Add `'rpc'` to the mode validation:

```typescript
// Change this line:
if (val === 'json' || val === 'text') result.mode = val
// To:
if (val === 'json' || val === 'text' || val === 'rpc') result.mode = val
```

2. Add `--cwd` flag parsing. Add `cwd?: string` to the `CliFlags` interface and add this case in the `while` loop, after the `--append-system-prompt` case:

```typescript
} else if (arg === '--cwd' && i + 1 < argv.length) {
  result.cwd = argv[++i]
```

- [ ] **Step 2: Apply `--cwd` early, before session creation**

After `const cliFlags = parseCliFlags(process.argv.slice(2))` (around line 60), add:

```typescript
// Apply --cwd before any path-dependent initialization
if (cliFlags.cwd) {
  process.chdir(cliFlags.cwd)
}
```

This must be before `SessionManager.create(process.cwd(), sessionsDir)` and `SettingsManager.create(agentDir)`.

- [ ] **Step 3: Add RPC mode routing**

In the mode routing section at the bottom of `cli.ts`, the current code checks `if (isPrintMode)` then falls through to interactive. Change the structure to handle three cases. Replace the final mode routing block (starting around `if (isPrintMode) {`) with:

```typescript
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
} else if (isPrintMode) {
  // ... existing print mode code unchanged ...
} else {
  const interactiveMode = new InteractiveMode(session)
  await interactiveMode.run()
}
```

- [ ] **Step 4: Update `isPrintMode` to exclude rpc**

The `isPrintMode` const currently includes all `--mode` values. Ensure it doesn't capture `rpc`:

```typescript
const isPrintMode = cliFlags.mode === 'json' || cliFlags.mode === 'text' || cliFlags.print
```

This is already correct (it doesn't check for `'rpc'`), but verify it by reading the line.

- [ ] **Step 5: Build and verify**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/cli
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Manual smoke test**

```bash
echo '{"type":"get_state"}' | node dist/loader.js --mode rpc 2>/dev/null | head -5
```

Expected: A JSON line with `{"type":"response","command":"get_state","success":true,...}` (the session state). The process stays alive; kill with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/cli/src/cli.ts
git commit -m "feat(cli): add --mode rpc and --cwd flags for Symphony integration"
```

---

## Task 2: Pi RPC protocol types (`protocol.rs`)

**Files:**
- Create: `apps/symphony/src/pi_agent/protocol.rs`
- Create: `apps/symphony/src/pi_agent/mod.rs`
- Modify: `apps/symphony/src/lib.rs`

- [ ] **Step 1: Create module structure**

Create `apps/symphony/src/pi_agent/mod.rs`:

```rust
//! Pi-coding-agent RPC bridge — subprocess lifecycle, JSON-line I/O, and event mapping.
//!
//! Replaces the Codex app-server bridge (`src/codex/`) with a client that speaks
//! the pi RPC protocol over stdin/stdout JSON lines.

pub mod protocol;
pub mod rpc_bridge;
pub mod token_accounting;
```

Add to `apps/symphony/src/lib.rs`, after `pub mod codex;`:

```rust
pub mod pi_agent;
```

- [ ] **Step 2: Write protocol types — commands**

Create `apps/symphony/src/pi_agent/protocol.rs`. Start with the RPC commands Symphony needs to send:

```rust
//! Pi RPC protocol types — commands (stdin), responses and events (stdout).
//!
//! Only the subset of the pi RPC protocol needed by Symphony is modeled here.
//! See pi-coding-agent `src/modes/rpc/rpc-types.ts` for the full protocol.

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── Commands (Symphony → Kata stdin) ──────────────────────────────────

/// A command sent to the Kata RPC process via stdin.
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum RpcCommand {
    #[serde(rename = "prompt")]
    Prompt {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
    #[serde(rename = "abort")]
    Abort {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "get_state")]
    GetState {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
    #[serde(rename = "get_session_stats")]
    GetSessionStats {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
    },
}
```

- [ ] **Step 3: Write protocol types — responses**

Append to `protocol.rs`:

```rust
// ── Responses (Kata stdout → Symphony) ────────────────────────────────

/// A response to a command, identified by matching `id` and `command` fields.
#[derive(Debug, Deserialize)]
pub struct RpcResponse {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub type_: String, // always "response"
    pub command: String,
    pub success: bool,
    #[serde(default)]
    pub data: Option<Value>,
    #[serde(default)]
    pub error: Option<String>,
}

/// Token stats returned by `get_session_stats`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct SessionTokens {
    pub input: u64,
    pub output: u64,
    #[serde(default, rename = "cacheRead")]
    pub cache_read: u64,
    #[serde(default, rename = "cacheWrite")]
    pub cache_write: u64,
    pub total: u64,
}

/// Session stats returned by `get_session_stats`.
#[derive(Debug, Deserialize)]
pub struct SessionStats {
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub user_messages: u64,
    #[serde(default)]
    pub assistant_messages: u64,
    #[serde(default)]
    pub tool_calls: u64,
    #[serde(default)]
    pub total_messages: u64,
    pub tokens: SessionTokens,
    #[serde(default)]
    pub cost: f64,
}
```

- [ ] **Step 4: Write protocol types — agent events**

Append to `protocol.rs`:

```rust
// ── Events (Kata stdout → Symphony) ───────────────────────────────────

/// A line from Kata's stdout. Can be a response, an agent event, or an
/// extension UI request. We parse the `type` field first to determine
/// which variant to deserialize into.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum RpcOutputLine {
    // ── Responses ─────────────────────────────────────────────────────
    #[serde(rename = "response")]
    Response(RpcResponse),

    // ── Agent lifecycle events ────────────────────────────────────────
    #[serde(rename = "agent_start")]
    AgentStart,

    #[serde(rename = "agent_end")]
    AgentEnd {
        #[serde(default)]
        messages: Value,
    },

    // ── Turn lifecycle ────────────────────────────────────────────────
    #[serde(rename = "turn_start")]
    TurnStart,

    #[serde(rename = "turn_end")]
    TurnEnd {
        #[serde(default)]
        message: Value,
    },

    // ── Message lifecycle ─────────────────────────────────────────────
    #[serde(rename = "message_start")]
    MessageStart {
        #[serde(default)]
        message: Value,
    },

    #[serde(rename = "message_update")]
    MessageUpdate {
        #[serde(default)]
        message: Value,
    },

    #[serde(rename = "message_end")]
    MessageEnd {
        #[serde(default)]
        message: Value,
    },

    // ── Tool execution ────────────────────────────────────────────────
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
        #[serde(default)]
        args: Value,
    },

    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
    },

    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        #[serde(default, rename = "toolCallId")]
        tool_call_id: Option<String>,
        #[serde(default, rename = "toolName")]
        tool_name: Option<String>,
        #[serde(default, rename = "isError")]
        is_error: bool,
    },

    // ── Compaction ────────────────────────────────────────────────────
    #[serde(rename = "auto_compaction_start")]
    AutoCompactionStart {
        #[serde(default)]
        reason: Option<String>,
    },

    #[serde(rename = "auto_compaction_end")]
    AutoCompactionEnd {
        #[serde(default)]
        aborted: bool,
    },

    // ── Retry ─────────────────────────────────────────────────────────
    #[serde(rename = "auto_retry_start")]
    AutoRetryStart {
        #[serde(default)]
        attempt: u32,
        #[serde(default)]
        max_attempts: u32,
        #[serde(default)]
        delay_ms: u64,
        #[serde(default)]
        error_message: Option<String>,
    },

    #[serde(rename = "auto_retry_end")]
    AutoRetryEnd {
        #[serde(default)]
        success: bool,
    },

    // ── Extension UI (fire-and-forget or needs response) ──────────────
    #[serde(rename = "extension_ui_request")]
    ExtensionUIRequest {
        id: String,
        method: String,
        #[serde(flatten)]
        extra: Value,
    },

    // ── Extension errors ──────────────────────────────────────────────
    #[serde(rename = "extension_error")]
    ExtensionError {
        #[serde(default)]
        extension_path: Option<String>,
        #[serde(default)]
        error: Option<String>,
    },
}

/// Extension UI response sent back to Kata to auto-decline interactive requests.
#[derive(Debug, Serialize)]
pub struct ExtensionUIResponse {
    #[serde(rename = "type")]
    pub type_: String, // always "extension_ui_response"
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirmed: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

impl ExtensionUIResponse {
    /// Auto-decline: cancel selection/input/editor requests.
    pub fn cancel(id: String) -> Self {
        Self {
            type_: "extension_ui_response".to_string(),
            id,
            cancelled: Some(true),
            confirmed: None,
            value: None,
        }
    }

    /// Auto-decline: reject confirmation requests.
    pub fn reject(id: String) -> Self {
        Self {
            type_: "extension_ui_response".to_string(),
            id,
            cancelled: None,
            confirmed: Some(false),
            value: None,
        }
    }
}
```

- [ ] **Step 5: Verify it compiles**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/symphony
cargo check
```

Expected: Warnings about unused modules (rpc_bridge, token_accounting don't exist yet), but no errors. Create empty placeholder files if needed:

```bash
touch src/pi_agent/rpc_bridge.rs src/pi_agent/token_accounting.rs
```

- [ ] **Step 6: Write unit tests for protocol serde**

Create `apps/symphony/tests/pi_agent_tests.rs`:

```rust
//! Tests for the pi_agent module — protocol serde, bridge lifecycle, token accounting.

use serde_json::json;
use symphony::pi_agent::protocol::*;

#[test]
fn serialize_prompt_command() {
    let cmd = RpcCommand::Prompt {
        id: Some("abc".to_string()),
        message: "Hello world".to_string(),
    };
    let json = serde_json::to_value(&cmd).unwrap();
    assert_eq!(json["type"], "prompt");
    assert_eq!(json["id"], "abc");
    assert_eq!(json["message"], "Hello world");
}

#[test]
fn serialize_get_state_command() {
    let cmd = RpcCommand::GetState { id: None };
    let json = serde_json::to_value(&cmd).unwrap();
    assert_eq!(json["type"], "get_state");
    assert!(json.get("id").is_none() || json["id"].is_null());
}

#[test]
fn serialize_get_session_stats_command() {
    let cmd = RpcCommand::GetSessionStats {
        id: Some("stats-1".to_string()),
    };
    let json = serde_json::to_value(&cmd).unwrap();
    assert_eq!(json["type"], "get_session_stats");
    assert_eq!(json["id"], "stats-1");
}

#[test]
fn deserialize_response_success() {
    let line = json!({
        "type": "response",
        "command": "prompt",
        "success": true
    });
    let parsed: RpcOutputLine = serde_json::from_value(line).unwrap();
    match parsed {
        RpcOutputLine::Response(r) => {
            assert_eq!(r.command, "prompt");
            assert!(r.success);
        }
        other => panic!("expected Response, got {:?}", other),
    }
}

#[test]
fn deserialize_agent_end_event() {
    let line = json!({
        "type": "agent_end",
        "messages": []
    });
    let parsed: RpcOutputLine = serde_json::from_value(line).unwrap();
    assert!(matches!(parsed, RpcOutputLine::AgentEnd { .. }));
}

#[test]
fn deserialize_tool_execution_start() {
    let line = json!({
        "type": "tool_execution_start",
        "toolCallId": "tc-1",
        "toolName": "bash",
        "args": {"command": "ls"}
    });
    let parsed: RpcOutputLine = serde_json::from_value(line).unwrap();
    match parsed {
        RpcOutputLine::ToolExecutionStart { tool_name, .. } => {
            assert_eq!(tool_name.as_deref(), Some("bash"));
        }
        other => panic!("expected ToolExecutionStart, got {:?}", other),
    }
}

#[test]
fn deserialize_extension_ui_request() {
    let line = json!({
        "type": "extension_ui_request",
        "id": "ui-1",
        "method": "confirm",
        "title": "Allow?",
        "message": "Do you approve?"
    });
    let parsed: RpcOutputLine = serde_json::from_value(line).unwrap();
    match parsed {
        RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
            assert_eq!(id, "ui-1");
            assert_eq!(method, "confirm");
        }
        other => panic!("expected ExtensionUIRequest, got {:?}", other),
    }
}

#[test]
fn extension_ui_response_cancel() {
    let resp = ExtensionUIResponse::cancel("ui-1".to_string());
    let json = serde_json::to_value(&resp).unwrap();
    assert_eq!(json["type"], "extension_ui_response");
    assert_eq!(json["id"], "ui-1");
    assert_eq!(json["cancelled"], true);
    assert!(json.get("confirmed").is_none());
}

#[test]
fn extension_ui_response_reject() {
    let resp = ExtensionUIResponse::reject("ui-2".to_string());
    let json = serde_json::to_value(&resp).unwrap();
    assert_eq!(json["type"], "extension_ui_response");
    assert_eq!(json["id"], "ui-2");
    assert_eq!(json["confirmed"], false);
    assert!(json.get("cancelled").is_none());
}

#[test]
fn deserialize_session_stats() {
    let data = json!({
        "session_id": "sess-1",
        "user_messages": 3,
        "assistant_messages": 3,
        "tool_calls": 5,
        "total_messages": 11,
        "tokens": {
            "input": 12000,
            "output": 3000,
            "cacheRead": 500,
            "cacheWrite": 200,
            "total": 15000
        },
        "cost": 0.05
    });
    let stats: SessionStats = serde_json::from_value(data).unwrap();
    assert_eq!(stats.tokens.input, 12000);
    assert_eq!(stats.tokens.output, 3000);
    assert_eq!(stats.tokens.total, 15000);
}

#[test]
fn deserialize_auto_compaction_events() {
    let start = json!({"type": "auto_compaction_start", "reason": "threshold"});
    let parsed: RpcOutputLine = serde_json::from_value(start).unwrap();
    assert!(matches!(parsed, RpcOutputLine::AutoCompactionStart { .. }));

    let end = json!({"type": "auto_compaction_end", "aborted": false});
    let parsed: RpcOutputLine = serde_json::from_value(end).unwrap();
    assert!(matches!(parsed, RpcOutputLine::AutoCompactionEnd { aborted: false }));
}
```

- [ ] **Step 7: Run tests**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/symphony
cargo test --test pi_agent_tests
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/src/pi_agent/ apps/symphony/src/lib.rs apps/symphony/tests/pi_agent_tests.rs
git commit -m "feat(symphony): add pi_agent protocol types with serde"
```

---

## Task 3: Token accounting (`token_accounting.rs`)

**Files:**
- Create: `apps/symphony/src/pi_agent/token_accounting.rs`
- Modify: `apps/symphony/tests/pi_agent_tests.rs`

- [ ] **Step 1: Write the failing tests**

Append to `apps/symphony/tests/pi_agent_tests.rs`:

```rust
use symphony::pi_agent::token_accounting::TokenTracker;

#[test]
fn token_tracker_first_snapshot() {
    let mut tracker = TokenTracker::new();
    let delta = tracker.update(10000, 2000, 12000);
    assert_eq!(delta.input_tokens, 10000);
    assert_eq!(delta.output_tokens, 2000);
    assert_eq!(delta.total_tokens, 12000);
}

#[test]
fn token_tracker_delta_computation() {
    let mut tracker = TokenTracker::new();
    tracker.update(10000, 2000, 12000);
    let delta = tracker.update(15000, 3500, 18500);
    assert_eq!(delta.input_tokens, 5000);
    assert_eq!(delta.output_tokens, 1500);
    assert_eq!(delta.total_tokens, 6500);
}

#[test]
fn token_tracker_no_negative_deltas() {
    let mut tracker = TokenTracker::new();
    tracker.update(10000, 2000, 12000);
    // After compaction, cumulative totals can decrease
    let delta = tracker.update(5000, 1000, 6000);
    assert_eq!(delta.input_tokens, 0);
    assert_eq!(delta.output_tokens, 0);
    assert_eq!(delta.total_tokens, 0);
}
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cargo test --test pi_agent_tests token_tracker
```

Expected: Compilation error — `TokenTracker` doesn't exist yet.

- [ ] **Step 3: Implement token tracking**

Write `apps/symphony/src/pi_agent/token_accounting.rs`:

```rust
//! Token accounting for pi-agent sessions.
//!
//! Pi reports cumulative token totals via `get_session_stats`. This module
//! tracks the last-seen totals and computes per-prompt deltas.

/// Per-prompt incremental token consumption.
#[derive(Debug, Clone, Default)]
pub struct TokenDelta {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}

/// Tracks cumulative token totals and computes deltas.
#[derive(Debug, Clone, Default)]
pub struct TokenTracker {
    last_input: u64,
    last_output: u64,
    last_total: u64,
}

impl TokenTracker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Update with new cumulative totals, returning the delta since last update.
    /// Deltas are clamped to zero (cumulative totals can decrease after compaction).
    pub fn update(&mut self, input: u64, output: u64, total: u64) -> TokenDelta {
        let delta = TokenDelta {
            input_tokens: input.saturating_sub(self.last_input),
            output_tokens: output.saturating_sub(self.last_output),
            total_tokens: total.saturating_sub(self.last_total),
        };
        self.last_input = input;
        self.last_output = output;
        self.last_total = total;
        delta
    }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cargo test --test pi_agent_tests token_tracker
```

Expected: All 3 token_tracker tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/src/pi_agent/token_accounting.rs apps/symphony/tests/pi_agent_tests.rs
git commit -m "feat(symphony): add pi_agent token accounting"
```

---

## Task 4: RPC bridge — subprocess lifecycle (`rpc_bridge.rs`)

**Files:**
- Create: `apps/symphony/src/pi_agent/rpc_bridge.rs`
- Modify: `apps/symphony/tests/pi_agent_tests.rs`

This is the core module. It implements `start_session`, `run_turn`, and `stop_session` with the same shape as `codex::app_server`.

- [ ] **Step 1: Write `SessionHandle` and `start_session`**

Create `apps/symphony/src/pi_agent/rpc_bridge.rs`:

```rust
//! Pi RPC bridge — subprocess lifecycle, JSON-line I/O, and turn management.
//!
//! Spawns `kata --mode rpc` as a subprocess and communicates via JSON lines
//! on stdin/stdout. Provides the same public interface as `codex::app_server`
//! (start_session, run_turn, stop_session).

use std::path::Path;
use std::process::Stdio;

use chrono::Utc;
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use uuid::Uuid;

use crate::domain::{AgentEvent, Issue, PiAgentConfig};
use crate::error::{Result, SymphonyError};
use crate::path_safety;
use crate::pi_agent::protocol::*;
use crate::pi_agent::token_accounting::{TokenDelta, TokenTracker};
use crate::ssh;

// ── Constants ─────────────────────────────────────────────────────────

/// Maximum bytes printed from non-JSON lines in logs.
const MAX_STREAM_LOG_BYTES: usize = 1_000;

/// Default timeout for reading the initial get_state response (ms).
const HANDSHAKE_TIMEOUT_MS: u64 = 30_000;

// ── Public types ──────────────────────────────────────────────────────

/// Opaque handle to a running Kata RPC subprocess session.
pub struct SessionHandle {
    pub session_id: String,
    child: tokio::process::Child,
    stdin: tokio::process::ChildStdin,
    stdout_reader: BufReader<tokio::process::ChildStdout>,
    pid: Option<String>,
    // Issue metadata for logging
    issue_id: String,
    issue_identifier: String,
    // Config
    read_timeout_ms: u64,
    stall_timeout_ms: u64,
    // Token tracking
    token_tracker: TokenTracker,
}

/// The outcome of a completed prompt (equivalent to Codex TurnResult).
#[derive(Debug)]
pub struct TurnResult {
    pub events: Vec<AgentEvent>,
    pub output_text: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub rate_limits: Option<Value>,
}

// ── Helpers ───────────────────────────────────────────────────────────

/// Send a JSON line to the subprocess stdin.
async fn send_command(
    stdin: &mut tokio::process::ChildStdin,
    command: &RpcCommand,
) -> Result<()> {
    let mut line = serde_json::to_string(command)
        .map_err(|e| SymphonyError::PiAgentError(format!("serialize command: {e}")))?;
    line.push('\n');
    stdin
        .write_all(line.as_bytes())
        .await
        .map_err(|e| SymphonyError::PiAgentError(format!("write stdin: {e}")))?;
    stdin
        .flush()
        .await
        .map_err(|e| SymphonyError::PiAgentError(format!("flush stdin: {e}")))?;
    Ok(())
}

/// Read one JSON line from stdout, with timeout.
async fn read_line(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    timeout_ms: u64,
) -> Result<String> {
    let mut line = String::new();
    let read_fut = reader.read_line(&mut line);
    match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), read_fut).await {
        Ok(Ok(0)) => Err(SymphonyError::PiAgentError(
            "subprocess stdout closed (EOF)".to_string(),
        )),
        Ok(Ok(_)) => Ok(line),
        Ok(Err(e)) => Err(SymphonyError::PiAgentError(format!("read stdout: {e}"))),
        Err(_) => Err(SymphonyError::PiAgentError(format!(
            "read timeout after {timeout_ms}ms"
        ))),
    }
}

/// Parse a JSON line into an RpcOutputLine. Non-JSON lines are logged and skipped.
fn parse_output_line(line: &str) -> Option<RpcOutputLine> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    match serde_json::from_str::<RpcOutputLine>(trimmed) {
        Ok(parsed) => Some(parsed),
        Err(e) => {
            let preview = if trimmed.len() > MAX_STREAM_LOG_BYTES {
                &trimmed[..MAX_STREAM_LOG_BYTES]
            } else {
                trimmed
            };
            tracing::debug!(
                error = %e,
                line = %preview,
                "non-parseable stdout line from pi-agent"
            );
            None
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────

/// Start a Kata RPC session for the given issue.
///
/// Spawns `kata --mode rpc` with the workspace as cwd, then sends `get_state`
/// to verify the session is alive.
pub async fn start_session(
    config: &PiAgentConfig,
    issue: &Issue,
    workspace_path: &Path,
    workspace_root: &Path,
    worker_host: Option<&str>,
) -> Result<SessionHandle> {
    // Validate workspace path
    path_safety::validate_workspace_path(workspace_path, workspace_root)?;
    let workspace_str = workspace_path
        .to_str()
        .ok_or_else(|| SymphonyError::PiAgentError("workspace path is not UTF-8".to_string()))?;

    // Build command args
    let mut args: Vec<String> = vec![
        "--mode".to_string(),
        "rpc".to_string(),
        "--cwd".to_string(),
        workspace_str.to_string(),
        "--no-session".to_string(),
    ];
    if let Some(ref model) = config.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }
    if let Some(ref system_prompt_path) = config.append_system_prompt {
        args.push("--append-system-prompt".to_string());
        args.push(system_prompt_path.clone());
    }

    // Spawn subprocess (local or SSH)
    let (mut child, stdin, stdout) = if let Some(host) = worker_host {
        let full_cmd = format!(
            "{} {}",
            config.command.join(" "),
            args.iter()
                .map(|a| crate::ssh::shell_escape(a))
                .collect::<Vec<_>>()
                .join(" ")
        );
        let mut child = SshRunner::start_process(host, &full_cmd)
            .await
            .map_err(|e| SymphonyError::PiAgentError(format!("SSH spawn failed: {e}")))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| SymphonyError::PiAgentError("no stdin on SSH child".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| SymphonyError::PiAgentError("no stdout on SSH child".to_string()))?;
        (child, stdin, stdout)
    } else {
        let program = config
            .command
            .first()
            .ok_or_else(|| SymphonyError::PiAgentError("empty command".to_string()))?;
        let cmd_args: Vec<&str> = config.command[1..]
            .iter()
            .map(|s| s.as_str())
            .chain(args.iter().map(|s| s.as_str()))
            .collect();

        let mut child = tokio::process::Command::new(program)
            .args(&cmd_args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .current_dir(workspace_path)
            .spawn()
            .map_err(|e| SymphonyError::PiAgentError(format!("spawn failed: {e}")))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| SymphonyError::PiAgentError("no stdin".to_string()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| SymphonyError::PiAgentError("no stdout".to_string()))?;
        (child, stdin, stdout)
    };

    let pid = child.id().map(|p| p.to_string());
    let mut stdout_reader = BufReader::new(stdout);
    let mut handle_stdin = stdin;

    // Handshake: send get_state and wait for response
    let state_id = Uuid::new_v4().to_string();
    send_command(
        &mut handle_stdin,
        &RpcCommand::GetState {
            id: Some(state_id.clone()),
        },
    )
    .await?;

    // Read lines until we get the get_state response (skip startup noise)
    let handshake_deadline =
        tokio::time::Instant::now() + std::time::Duration::from_millis(HANDSHAKE_TIMEOUT_MS);

    let session_id = loop {
        let remaining = handshake_deadline
            .saturating_duration_since(tokio::time::Instant::now())
            .as_millis() as u64;
        if remaining == 0 {
            // Kill the child on timeout
            let _ = child.kill().await;
            return Err(SymphonyError::PiAgentError(
                "handshake timeout — no get_state response".to_string(),
            ));
        }
        let line = read_line(&mut stdout_reader, remaining.min(5000)).map_err(|e| {
            SymphonyError::PiAgentError(format!("handshake read failed: {e}"))
        });
        match tokio::time::timeout(std::time::Duration::from_millis(remaining), line).await {
            Ok(Ok(line)) => {
                if let Some(parsed) = parse_output_line(&line) {
                    match parsed {
                        RpcOutputLine::Response(ref r)
                            if r.command == "get_state" && r.success =>
                        {
                            // Extract session_id from response data
                            let sid = r
                                .data
                                .as_ref()
                                .and_then(|d| d.get("sessionId"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("unknown")
                                .to_string();
                            break sid;
                        }
                        // Auto-respond to extension UI requests during startup
                        RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                            let response = match method.as_str() {
                                "confirm" => ExtensionUIResponse::reject(id),
                                _ => ExtensionUIResponse::cancel(id),
                            };
                            let mut resp_line = serde_json::to_string(&response)
                                .unwrap_or_default();
                            resp_line.push('\n');
                            let _ = handle_stdin.write_all(resp_line.as_bytes()).await;
                            let _ = handle_stdin.flush().await;
                        }
                        _ => {
                            // Skip other events during handshake
                        }
                    }
                }
            }
            Ok(Err(_)) | Err(_) => {
                // Read error or inner timeout — continue until handshake deadline
            }
        }
    };

    tracing::info!(
        event = "pi_agent_session_started",
        issue_id = %issue.id,
        issue_identifier = %issue.identifier,
        session_id = %session_id,
        pid = ?pid,
        "pi-agent RPC session started"
    );

    Ok(SessionHandle {
        session_id,
        child,
        stdin: handle_stdin,
        stdout_reader,
        pid,
        issue_id: issue.id.clone(),
        issue_identifier: issue.identifier.clone(),
        read_timeout_ms: config.read_timeout_ms,
        stall_timeout_ms: config.stall_timeout_ms,
        token_tracker: TokenTracker::new(),
    })
}
```

- [ ] **Step 2: Implement `run_turn`**

Append to `rpc_bridge.rs`:

```rust
/// Send a prompt and stream events until `agent_end`.
///
/// Maps pi events to Symphony `AgentEvent` and calls `event_callback` for each.
/// After completion, fetches session stats for token deltas.
pub async fn run_turn<F>(
    handle: &mut SessionHandle,
    prompt: &str,
    mut event_callback: F,
) -> Result<TurnResult>
where
    F: FnMut(AgentEvent) + Send,
{
    let prompt_id = Uuid::new_v4().to_string();

    // Send prompt command
    send_command(
        &mut handle.stdin,
        &RpcCommand::Prompt {
            id: Some(prompt_id.clone()),
            message: prompt.to_string(),
        },
    )
    .await?;

    // Stream events until agent_end
    let mut events: Vec<AgentEvent> = Vec::new();
    let mut output_text: Option<String> = None;
    let mut got_agent_end = false;

    // Use stall_timeout as the maximum time between any two lines
    let read_timeout = handle.stall_timeout_ms.max(handle.read_timeout_ms);

    loop {
        let line = match read_line(&mut handle.stdout_reader, read_timeout).await {
            Ok(line) => line,
            Err(e) => {
                let event = AgentEvent::TurnFailed {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    turn_id: prompt_id.clone(),
                    error: format!("read error: {e}"),
                };
                event_callback(event.clone());
                events.push(event);
                return Err(SymphonyError::PiAgentError(format!(
                    "stream read failed: {e}"
                )));
            }
        };

        let Some(parsed) = parse_output_line(&line) else {
            continue;
        };

        match parsed {
            RpcOutputLine::AgentEnd { .. } => {
                got_agent_end = true;
                break;
            }

            RpcOutputLine::Response(ref r) if r.command == "prompt" && !r.success => {
                let err_msg = r
                    .error
                    .clone()
                    .unwrap_or_else(|| "prompt failed".to_string());
                let event = AgentEvent::TurnFailed {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    turn_id: prompt_id.clone(),
                    error: err_msg.clone(),
                };
                event_callback(event.clone());
                events.push(event);
                return Err(SymphonyError::PiAgentError(err_msg));
            }

            // Ack response for prompt — expected, continue streaming
            RpcOutputLine::Response(ref r) if r.command == "prompt" && r.success => {}

            // Tool execution — map to Notification for dashboard
            RpcOutputLine::ToolExecutionStart {
                tool_name, args, ..
            } => {
                let name = tool_name.as_deref().unwrap_or("unknown");
                let args_preview = serde_json::to_string(&args)
                    .unwrap_or_default()
                    .chars()
                    .take(200)
                    .collect::<String>();
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!("tool_start: {name} {args_preview}"),
                };
                event_callback(event.clone());
                events.push(event);
            }

            RpcOutputLine::ToolExecutionEnd {
                tool_name,
                is_error,
                ..
            } => {
                let name = tool_name.as_deref().unwrap_or("unknown");
                if is_error {
                    let event = AgentEvent::Notification {
                        timestamp: Utc::now(),
                        codex_app_server_pid: handle.pid.clone(),
                        message: format!("tool_error: {name}"),
                    };
                    event_callback(event.clone());
                    events.push(event);
                }
            }

            // Auto-compaction — log
            RpcOutputLine::AutoCompactionStart { reason } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!(
                        "auto_compaction_start: {}",
                        reason.as_deref().unwrap_or("unknown")
                    ),
                };
                event_callback(event.clone());
                events.push(event);
            }

            RpcOutputLine::AutoRetryStart {
                attempt,
                error_message,
                ..
            } => {
                let event = AgentEvent::Notification {
                    timestamp: Utc::now(),
                    codex_app_server_pid: handle.pid.clone(),
                    message: format!(
                        "auto_retry attempt {}: {}",
                        attempt,
                        error_message.as_deref().unwrap_or("")
                    ),
                };
                event_callback(event.clone());
                events.push(event);
            }

            // Extension UI — auto-decline
            RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                let response = match method.as_str() {
                    "confirm" => ExtensionUIResponse::reject(id),
                    "notify" | "setStatus" | "setWidget" | "setTitle" | "set_editor_text" => {
                        continue; // fire-and-forget, no response needed
                    }
                    _ => ExtensionUIResponse::cancel(id),
                };
                let mut resp_line =
                    serde_json::to_string(&response).unwrap_or_default();
                resp_line.push('\n');
                let _ = handle.stdin.write_all(resp_line.as_bytes()).await;
                let _ = handle.stdin.flush().await;
            }

            // Message end — capture final assistant text
            RpcOutputLine::MessageEnd { ref message } => {
                if let Some(content) = message
                    .get("content")
                    .and_then(|c| c.as_array())
                {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                output_text = Some(text.to_string());
                            }
                        }
                    }
                }
            }

            // Extension error — log
            RpcOutputLine::ExtensionError { error, .. } => {
                if let Some(err) = error {
                    tracing::warn!(
                        issue_id = %handle.issue_id,
                        error = %err,
                        "extension error from pi-agent"
                    );
                }
            }

            // All other events — skip (turn_start, turn_end, message_start, etc.)
            _ => {}
        }
    }

    if !got_agent_end {
        return Err(SymphonyError::PiAgentError(
            "stream ended without agent_end".to_string(),
        ));
    }

    // Fetch session stats for token accounting
    let stats_id = Uuid::new_v4().to_string();
    send_command(
        &mut handle.stdin,
        &RpcCommand::GetSessionStats {
            id: Some(stats_id.clone()),
        },
    )
    .await?;

    // Read until we get the stats response (brief timeout)
    let token_delta = match read_stats_response(&mut handle.stdout_reader, &mut handle.stdin, handle.read_timeout_ms)
        .await
    {
        Ok(stats) => handle.token_tracker.update(
            stats.tokens.input,
            stats.tokens.output,
            stats.tokens.total,
        ),
        Err(e) => {
            tracing::warn!(
                issue_id = %handle.issue_id,
                error = %e,
                "failed to get session stats; token delta will be zero"
            );
            TokenDelta::default()
        }
    };

    // Emit TurnCompleted event
    let completed_event = AgentEvent::TurnCompleted {
        timestamp: Utc::now(),
        codex_app_server_pid: handle.pid.clone(),
        turn_id: prompt_id,
        message: output_text.clone(),
        input_tokens: token_delta.input_tokens,
        output_tokens: token_delta.output_tokens,
        total_tokens: token_delta.total_tokens,
        rate_limits: None,
    };
    event_callback(completed_event.clone());
    events.push(completed_event);

    Ok(TurnResult {
        events,
        output_text,
        input_tokens: token_delta.input_tokens,
        output_tokens: token_delta.output_tokens,
        total_tokens: token_delta.total_tokens,
        rate_limits: None,
    })
}

/// Read stdout lines until we find a get_session_stats response.
async fn read_stats_response(
    reader: &mut BufReader<tokio::process::ChildStdout>,
    stdin: &mut tokio::process::ChildStdin,
    timeout_ms: u64,
) -> Result<SessionStats> {
    let deadline =
        tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms.max(5000));
    loop {
        let remaining = deadline
            .saturating_duration_since(tokio::time::Instant::now())
            .as_millis() as u64;
        if remaining == 0 {
            return Err(SymphonyError::PiAgentError(
                "timeout waiting for session stats".to_string(),
            ));
        }
        let line = read_line(reader, remaining).await?;
        if let Some(parsed) = parse_output_line(&line) {
            match parsed {
                RpcOutputLine::Response(r)
                    if r.command == "get_session_stats" && r.success =>
                {
                    let data = r.data.ok_or_else(|| {
                        SymphonyError::PiAgentError("stats response missing data".to_string())
                    })?;
                    let stats: SessionStats = serde_json::from_value(data).map_err(|e| {
                        SymphonyError::PiAgentError(format!("parse session stats: {e}"))
                    })?;
                    return Ok(stats);
                }
                // Auto-respond to extension UI requests that arrive between agent_end and stats
                RpcOutputLine::ExtensionUIRequest { id, method, .. } => {
                    let response = match method.as_str() {
                        "confirm" => ExtensionUIResponse::reject(id),
                        "notify" | "setStatus" | "setWidget" | "setTitle"
                        | "set_editor_text" => continue,
                        _ => ExtensionUIResponse::cancel(id),
                    };
                    let mut resp_line =
                        serde_json::to_string(&response).unwrap_or_default();
                    resp_line.push('\n');
                    let _ = stdin.write_all(resp_line.as_bytes()).await;
                    let _ = stdin.flush().await;
                }
                _ => {} // skip other lines
            }
        }
    }
}
```

- [ ] **Step 3: Implement `stop_session`**

Append to `rpc_bridge.rs`:

```rust
/// Stop the Kata RPC session. Sends abort, closes stdin, then kills.
pub async fn stop_session(mut handle: SessionHandle) -> Result<()> {
    // Try graceful abort
    let _ = send_command(
        &mut handle.stdin,
        &RpcCommand::Abort { id: None },
    )
    .await;

    // Close stdin to signal EOF
    drop(handle.stdin);

    // Wait briefly for exit
    match tokio::time::timeout(
        std::time::Duration::from_millis(3000),
        handle.child.wait(),
    )
    .await
    {
        Ok(Ok(status)) => {
            tracing::debug!(
                issue_id = %handle.issue_id,
                exit_status = %status,
                "pi-agent process exited"
            );
        }
        _ => {
            tracing::debug!(
                issue_id = %handle.issue_id,
                "pi-agent process did not exit gracefully, killing"
            );
            let _ = handle.child.kill().await;
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Add `PiAgentError` variant to error module**

Check if `SymphonyError::PiAgentError` already exists. If not, add it to `apps/symphony/src/error.rs`:

```rust
#[error("pi-agent error: {0}")]
PiAgentError(String),
```

- [ ] **Step 5: Check compilation**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/symphony
cargo check
```

Fix any compilation issues. The `uuid` crate may need to be added to `Cargo.toml` — check if it's already a dependency, and if not:

```bash
cargo add uuid --features v4
```

Note: Symphony already has `crate::ssh::shell_escape()` — no external crate needed.

- [ ] **Step 6: Run existing tests to ensure no regressions**

```bash
cargo test
```

Expected: All existing tests pass. New pi_agent tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/src/pi_agent/rpc_bridge.rs apps/symphony/src/error.rs apps/symphony/Cargo.toml
git commit -m "feat(symphony): add pi_agent RPC bridge (start_session, run_turn, stop_session)"
```

---

## Task 5: Config — `PiAgentConfig` and `AgentBackend` enum

**Files:**
- Modify: `apps/symphony/src/domain.rs`
- Modify: `apps/symphony/src/config.rs`
- Modify: `apps/symphony/tests/workflow_config_tests.rs`

- [ ] **Step 1: Add `PiAgentConfig` and `AgentBackend` to domain**

In `apps/symphony/src/domain.rs`, add after the `CodexConfig` block:

```rust
/// Which agent backend to use for worker sessions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentBackend {
    Pi,
    Codex,
}

impl Default for AgentBackend {
    fn default() -> Self {
        Self::Codex // default to Codex for backward compat during transition
    }
}

/// Pi-agent (Kata RPC) configuration.
#[derive(Debug, Clone)]
pub struct PiAgentConfig {
    /// Command and arguments to spawn the pi-agent process.
    /// Default: `["kata", "--mode", "rpc"]`
    pub command: Vec<String>,
    /// Model identifier (e.g. "anthropic/claude-sonnet-4-6").
    pub model: Option<String>,
    /// Skip session persistence.
    pub no_session: bool,
    /// Optional path to extra system prompt file.
    pub append_system_prompt: Option<String>,
    /// Read timeout for individual stdout reads (ms).
    pub read_timeout_ms: u64,
    /// Time before a non-progressing session is stalled (ms).
    pub stall_timeout_ms: u64,
}

impl Default for PiAgentConfig {
    fn default() -> Self {
        Self {
            command: vec!["kata".to_string()],
            model: None,
            no_session: true,
            append_system_prompt: None,
            read_timeout_ms: 5_000,
            stall_timeout_ms: 300_000,
        }
    }
}
```

Add `AgentBackend` and `PiAgentConfig` to the `ServiceConfig` struct:

```rust
pub struct ServiceConfig {
    pub tracker: TrackerConfig,
    pub polling: PollingConfig,
    pub workspace: WorkspaceConfig,
    pub worker: WorkerConfig,
    pub agent: AgentConfig,
    pub codex: CodexConfig,
    pub pi_agent: PiAgentConfig,       // ADD
    pub agent_backend: AgentBackend,    // ADD
    pub hooks: HooksConfig,
    pub server: ServerConfig,
}
```

Update the `Default` impl for `ServiceConfig` (or wherever it's derived) to include the new fields.

- [ ] **Step 2: Add config parsing for `pi_agent` section**

In `apps/symphony/src/config.rs`, add a raw deserialization struct:

```rust
#[derive(Deserialize, Default)]
#[serde(default)]
struct RawPiAgentConfig {
    command: Option<Value>,
    model: Option<String>,
    no_session: Option<bool>,
    append_system_prompt: Option<String>,
    read_timeout_ms: Option<u64>,
    stall_timeout_ms: Option<u64>,
}
```

In `from_workflow`, after extracting `raw_codex`, add:

```rust
let raw_pi_agent: RawPiAgentConfig = extract_section(&normalized, "pi_agent")?;
```

And add the resolution logic (before the final `Ok(ServiceConfig { ... })`):

```rust
// ── PiAgentConfig ─────────────────────────────────────────────────────
let pi_agent_command = match raw_pi_agent.command {
    Some(val) => parse_command_value(val, "pi_agent.command")?,
    None => defaults.pi_agent.command.clone(),
};
let pi_agent_model = raw_pi_agent
    .model
    .map(|v| resolve_env(&v))
    .filter(|v| !v.is_empty());
let pi_agent = PiAgentConfig {
    command: pi_agent_command,
    model: pi_agent_model,
    no_session: raw_pi_agent.no_session.unwrap_or(defaults.pi_agent.no_session),
    append_system_prompt: raw_pi_agent.append_system_prompt,
    read_timeout_ms: raw_pi_agent.read_timeout_ms.unwrap_or(defaults.pi_agent.read_timeout_ms),
    stall_timeout_ms: raw_pi_agent.stall_timeout_ms.unwrap_or(defaults.pi_agent.stall_timeout_ms),
};

// ── AgentBackend ──────────────────────────────────────────────────────
// Determine backend: explicit `agent.backend` field, or infer from presence of sections.
let agent_backend = raw_agent.backend
    .map(|v| match v.to_lowercase().as_str() {
        "pi" => Ok(AgentBackend::Pi),
        "codex" => Ok(AgentBackend::Codex),
        other => Err(SymphonyError::InvalidWorkflowConfig(
            format!("unknown agent.backend: {other:?} (expected 'pi' or 'codex')")
        )),
    })
    .transpose()?
    .unwrap_or(defaults.agent_backend);
```

Add `backend: Option<String>` to `RawAgentConfig`.

Extract `parse_codex_command` into a generic `parse_command_value(val, field_name)` helper that both codex and pi_agent use.

- [ ] **Step 3: Add `pi_agent` and `agent_backend` to final ServiceConfig construction**

In the `Ok(ServiceConfig { ... })` at the end of `from_workflow`, add the new fields:

```rust
pi_agent,
agent_backend,
```

- [ ] **Step 4: Write config parsing tests**

Append to `apps/symphony/tests/workflow_config_tests.rs`:

```rust
#[test]
fn pi_agent_config_defaults() {
    let yaml = r#"
tracker:
  kind: linear
  api_key: test-key
  project_slug: test
"#;
    let config = parse_workflow_config(yaml);
    assert_eq!(config.pi_agent.command, vec!["kata".to_string()]);
    assert!(config.pi_agent.model.is_none());
    assert!(config.pi_agent.no_session);
    assert_eq!(config.pi_agent.stall_timeout_ms, 300_000);
    assert_eq!(config.agent_backend, AgentBackend::Codex); // default
}

#[test]
fn pi_agent_config_explicit() {
    let yaml = r#"
tracker:
  kind: linear
  api_key: test-key
  project_slug: test
agent:
  backend: pi
pi_agent:
  command: "kata"
  model: "anthropic/claude-sonnet-4-6"
  stall_timeout_ms: 600000
"#;
    let config = parse_workflow_config(yaml);
    assert_eq!(config.agent_backend, AgentBackend::Pi);
    assert_eq!(config.pi_agent.model.as_deref(), Some("anthropic/claude-sonnet-4-6"));
    assert_eq!(config.pi_agent.stall_timeout_ms, 600_000);
}

#[test]
fn agent_backend_codex_explicit() {
    let yaml = r#"
tracker:
  kind: linear
  api_key: test-key
  project_slug: test
agent:
  backend: codex
"#;
    let config = parse_workflow_config(yaml);
    assert_eq!(config.agent_backend, AgentBackend::Codex);
}
```

Note: adapt the test helper function name (`parse_workflow_config`) to match whatever the existing tests use. Read the test file first to find the pattern.

- [ ] **Step 5: Run tests**

```bash
cargo test --test workflow_config_tests
cargo test --test pi_agent_tests
```

Expected: All pass.

- [ ] **Step 6: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/src/domain.rs apps/symphony/src/config.rs apps/symphony/tests/workflow_config_tests.rs
git commit -m "feat(symphony): add PiAgentConfig, AgentBackend to config schema"
```

---

## Task 6: Orchestrator — conditional backend dispatch

**Files:**
- Modify: `apps/symphony/src/orchestrator.rs`

- [ ] **Step 1: Update `WorkerTaskConfig` to include both backends**

Find `struct WorkerTaskConfig` in `orchestrator.rs` and add:

```rust
struct WorkerTaskConfig {
    workspace: WorkspaceConfig,
    hooks: HooksConfig,
    codex: CodexConfig,
    pi_agent: PiAgentConfig,            // ADD
    agent_backend: AgentBackend,         // ADD
    max_turns: u32,
    tracker: TrackerConfig,
    prompt_template: String,
    event_tx: tokio::sync::mpsc::UnboundedSender<(String, AgentEvent)>,
}
```

- [ ] **Step 2: Update `WorkerTaskConfig` construction**

Find where `WorkerTaskConfig` is constructed (search for `WorkerTaskConfig {` in the file). Add the new fields:

```rust
pi_agent: self.config.pi_agent.clone(),
agent_backend: self.config.agent_backend,
```

- [ ] **Step 3: Add conditional dispatch in `run_worker_task`**

Find the section in `run_worker_task` that calls `app_server::start_session` (step 4 in the function). Replace the Codex-only path with a conditional:

```rust
    // 4. Start agent session (conditional on backend)
    match config.agent_backend {
        AgentBackend::Pi => {
            run_worker_task_pi(issue, attempt, worker_host, config, workspace_info).await
        }
        AgentBackend::Codex => {
            run_worker_task_codex(issue, attempt, worker_host, config, workspace_info).await
        }
    }
```

Extract the existing Codex path into `run_worker_task_codex` and create a parallel `run_worker_task_pi` that uses `pi_agent::rpc_bridge`. The pi version is simpler because `run_turn` doesn't need the `graphql_executor`:

```rust
async fn run_worker_task_pi(
    issue: &Issue,
    attempt: Option<u32>,
    worker_host: Option<&str>,
    config: &WorkerTaskConfig,
) -> WorkerResult {
    let issue_id = issue.id.clone();
    let workspace_root = Path::new(&config.workspace.root);

    // Start pi-agent session
    let mut session = match pi_agent::rpc_bridge::start_session(
        &config.pi_agent,
        issue,
        workspace_path,
        workspace_root,
        worker_host,
    ).await {
        Ok(s) => s,
        Err(err) => {
            return WorkerResult {
                issue_id,
                completion: WorkerCompletion::Failed {
                    error: format!("pi-agent session start failed: {err}"),
                },
                events: vec![],
                metrics: None,
            };
        }
    };

    // Run turn loop (same structure as Codex but using pi_agent::run_turn)
    // ... (mirror the Codex turn loop, calling pi_agent::rpc_bridge::run_turn)
    
    // Stop session
    if let Err(err) = pi_agent::rpc_bridge::stop_session(session).await {
        tracing::warn!(issue_id = %issue_id, error = %err, "failed to stop pi-agent session");
    }

    // ... return WorkerResult
}
```

The exact implementation should mirror the existing `run_worker_task` flow but swap `app_server::*` calls with `pi_agent::rpc_bridge::*` calls. The key difference: `pi_agent::run_turn` does NOT take a `graphql_executor` parameter.

**Implementation approach:** Rather than duplicating the entire function, extract the common parts (workspace setup, hooks, turn loop logic) and only branch on session start/turn/stop. Read the full `run_worker_task` function carefully before implementing — it's the largest change in this plan.

- [ ] **Step 4: Update stall detection to use backend-appropriate timeout**

Find the stall detection code (search for `stall_timeout_ms`). It currently reads from `self.config.codex.stall_timeout_ms`. Update to:

```rust
let stall_timeout_ms = match self.config.agent_backend {
    AgentBackend::Pi => self.config.pi_agent.stall_timeout_ms,
    AgentBackend::Codex => self.config.codex.stall_timeout_ms,
}.min(i64::MAX as u64) as i64;
```

- [ ] **Step 5: Update `execute_worker_attempt` (second code path)**

There is a second code path at `orchestrator.rs:~1451` — `execute_worker_attempt` — that also calls `app_server::start_session`, `run_codex_turns_in_session`, and `app_server::stop_session`. This method needs the same conditional backend dispatch. Find `execute_worker_attempt` and add a pi-agent branch that mirrors the Codex path but uses `pi_agent::rpc_bridge::start_session`, `pi_agent::rpc_bridge::run_turn`, and `pi_agent::rpc_bridge::stop_session`. The pi path drops the `graphql_executor` parameter.

The cleanest approach: extract the session start → turn loop → stop into a helper that takes the backend enum, so both `run_worker_task` and `execute_worker_attempt` share the dispatch logic.

- [ ] **Step 6: Add `use` statements**

At the top of `orchestrator.rs`, add:

```rust
use crate::domain::{AgentBackend, PiAgentConfig};
use crate::pi_agent;
```

- [ ] **Step 7: Run all tests**

```bash
cargo test
```

Expected: All existing tests pass. The orchestrator tests use mock/test configs — verify they still default to `AgentBackend::Codex` and work unchanged.

- [ ] **Step 8: Run clippy**

```bash
cargo clippy -- -D warnings
```

Expected: No warnings.

- [ ] **Step 9: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/src/orchestrator.rs
git commit -m "feat(symphony): add conditional pi/codex backend dispatch in orchestrator"
```

---

## Task 7: Documentation and WORKFLOW-REFERENCE update

**Files:**
- Modify: `apps/symphony/docs/WORKFLOW-REFERENCE.md`
- Modify: `apps/symphony/AGENTS.md`

- [ ] **Step 1: Add `pi_agent` section to WORKFLOW-REFERENCE.md**

Read the existing `WORKFLOW-REFERENCE.md` and add a new section documenting the `pi_agent` config block and `agent.backend` field. Place it after the `codex` section:

```markdown
#### `agent.backend` field

| Field            | Type   | Default  | Description                                              |
| ---------------- | ------ | -------- | -------------------------------------------------------- |
| `agent.backend`  | string | `codex`  | Agent runtime: `"pi"` (Kata RPC) or `"codex"` (legacy). |

#### `pi_agent` section

| Field                          | Type             | Default | Description                                                     |
| ------------------------------ | ---------------- | ------- | --------------------------------------------------------------- |
| `pi_agent.command`             | string or string[] | `kata`  | Command to spawn the pi-agent process.                         |
| `pi_agent.model`               | string           | _(none)_ | Model identifier (e.g. `anthropic/claude-sonnet-4-6`).         |
| `pi_agent.no_session`          | bool             | `true`  | Skip session persistence (recommended for ephemeral workers).  |
| `pi_agent.append_system_prompt`| string           | _(none)_ | Path to extra system prompt file.                              |
| `pi_agent.read_timeout_ms`     | u64              | `5000`  | Timeout for individual stdout reads (ms).                      |
| `pi_agent.stall_timeout_ms`    | u64              | `300000`| Time before a non-progressing session is stalled (ms).         |
```

- [ ] **Step 2: Update AGENTS.md module map**

Add `pi_agent` to the module map table in `apps/symphony/AGENTS.md`:

```markdown
| Pi-agent RPC bridge | `src/pi_agent/rpc_bridge.rs` | Subprocess lifecycle, JSON-line I/O for pi-coding-agent |
| Pi-agent protocol | `src/pi_agent/protocol.rs` | RPC command/response/event serde types |
| Pi-agent tokens | `src/pi_agent/token_accounting.rs` | Token delta tracking via get_session_stats |
```

- [ ] **Step 3: Commit**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add apps/symphony/docs/WORKFLOW-REFERENCE.md apps/symphony/AGENTS.md
git commit -m "docs(symphony): document pi_agent config and module map"
```

---

## Task 8: Integration smoke test

**Files:** No new files — manual verification.

- [ ] **Step 1: Create a test WORKFLOW.md with pi backend**

```bash
cat > /tmp/test-symphony-pi-workflow.md << 'EOF'
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: test-project

agent:
  backend: pi
  max_turns: 3

pi_agent:
  command: kata
  model: anthropic/claude-sonnet-4-6
  stall_timeout_ms: 60000

workspace:
  root: /tmp/symphony_pi_test
  isolation: local
---

You are an agent working on issue {{ issue.identifier }}: {{ issue.title }}.

{{ issue.description }}

Work in the workspace at {{ workspace.base_branch }}.
Complete the task described above.
EOF
```

- [ ] **Step 2: Build Symphony**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony/apps/symphony
cargo build
```

Expected: Clean build.

- [ ] **Step 3: Run full test suite**

```bash
cargo test
```

Expected: All tests pass (existing + new).

- [ ] **Step 4: Run clippy**

```bash
cargo clippy -- -D warnings
```

Expected: Zero warnings.

- [ ] **Step 5: Commit any final fixes**

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-symphony
git add -A
git commit -m "test(symphony): integration smoke test and final fixes"
```
