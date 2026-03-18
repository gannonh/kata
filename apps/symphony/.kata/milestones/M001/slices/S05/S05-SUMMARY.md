---
id: S05
parent: M001
milestone: M001
provides:
  - src/codex/mod.rs — codex module entry point (app_server, dynamic_tool, token_accounting submodules)
  - src/codex/app_server.rs — complete subprocess lifecycle: workspace cwd validation, bash -lc spawn, 4-message JSON-RPC handshake, turn streaming with approval/tool/user-input handlers, token accounting (~600 lines)
  - src/codex/dynamic_tool.rs — tool_specs() + execute() with linear_graphql: argument normalisation, error formatting, executor injection
  - src/codex/token_accounting.rs — TokenState, TokenDelta, extract_token_delta, extract_rate_limits
  - src/linear/client.rs — graphql_raw public method for dynamic tool access
  - src/domain.rs — seven AgentEvent variants: SessionStarted, TurnCompleted, TurnFailed, TurnCancelled, Notification, OtherMessage, Malformed, ApprovalRequired, ApprovalAutoApproved, ToolCallCompleted, ToolCallFailed, UnsupportedToolCall, ToolInputAutoAnswered, TurnInputRequired
  - tests/codex_tests.rs — 32 integration tests covering all S05 behaviors
requires:
  - slice: S01
    provides: CodexConfig, Issue, AgentEvent, SymphonyError variants
  - slice: S04
    provides: path_safety::validate_workspace_path, path_safety::canonicalize
affects:
  - S06
  - S08
key_files:
  - src/codex/app_server.rs
  - src/codex/dynamic_tool.rs
  - src/codex/token_accounting.rs
  - src/linear/client.rs
  - src/domain.rs
  - tests/codex_tests.rs
key_decisions:
  - "graphql_raw extracted via shared graphql_http helper: graphql retains GraphQL-error promotion; graphql_raw returns raw body for dynamic_tool error inspection"
  - "dynamic_tool executor is a generic Fn(String, Value) -> Fut + Clone + Send — Fn (not FnOnce) enables multiple tool calls per turn; Clone enables per-call usage"
  - "start_session takes workspace_root: &Path explicitly — CodexConfig has no workspace root field; caller (orchestrator) owns both and passes them separately"
  - "auto_approve_requests derived at start_session time from approval_policy == 'never'; stored in SessionHandle; no per-turn caller API change"
  - "Approval rejection returns Err(SymphonyError::Other('approval_required')) — matches Elixir :approval_required atom; does not stall"
  - "stderr drained by fire-and-forget tokio::spawn task (logs at DEBUG); not merged into stdout stream — avoids polluting JSON-RPC line reader"
  - "Token accounting uses turn-local accumulator vars threaded through loop; SessionHandle not mutated — keeps run_turn side-effect-free relative to session state"
  - "Argument normalisation sentinels encoded as SymphonyError::Other(tag) — avoids proliferating codex-specific variants in shared error enum"
  - "User-input two-stage logic: approval-options first (auto_approve=true only), non-interactive fallback; hard-fail TurnInputRequired if question IDs absent"
patterns_established:
  - "Executor injection via generic Fn + Clone + Send bounds — pattern for all testable async dispatch in the codex module"
  - "Error tagging via SymphonyError::Other for module-local sentinel errors"
  - "Subprocess I/O: take stdin/stdout from Child before constructing SessionHandle; kill child in start_session error path before returning error"
  - "Receive loop: tokio::time::timeout per iteration for turn_timeout; EOF → wait child for PortExit; JSON parse failure → Malformed + continue; non-matching method → Notification + continue"
  - "graphql_executor.clone() per tool call — Fn+Clone is the pattern for multi-call executor injection in the turn loop"
  - "Approval handler pattern: match method str → handle_approval_or_reject → Ok(false) → return Err immediately; Ok(true) → continue loop"
  - "Token accounting: call extract_token_delta after every parsed JSON payload, accumulate into turn-local vars, return in TurnResult"
observability_surfaces:
  - "tracing::info! on session start (session_id, issue_id, issue_identifier) and turn complete"
  - "tracing::warn! on turn failure, cancellation, timeout, subprocess exit, approval required, input required"
  - "tracing::debug! for non-JSON stdout lines, notifications, ignored handshake messages, stderr"
  - "AgentEvent variants emitted via callback for all §10.4 event types"
  - "TurnResult.total_tokens / input_tokens / output_tokens / rate_limits: per-turn accounting"
  - "SymphonyError variants with context: InvalidWorkspaceCwd(msg), PortExit(i32), ResponseTimeout, TurnTimeout, TurnFailed(params_json), TurnCancelled(params_json), TurnInputRequired"
drill_down_paths:
  - .kata/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
  - .kata/milestones/M001/slices/S05/tasks/T02-SUMMARY.md
  - .kata/milestones/M001/slices/S05/tasks/T03-SUMMARY.md
duration: ~3 sessions (T01: 25min, T02: ~1 session, T03: ~2h)
verification_result: passed
completed_at: 2026-03-18
---

# S05: Codex App-Server Client

**Complete JSON-RPC over stdio client: subprocess launch, 4-message handshake, turn streaming with approval/tool/user-input handlers, token accounting, and linear_graphql dynamic tool — proven by 32 passing integration tests against fake Codex shell scripts.**

## What Happened

S05 was delivered across three tasks that built the Codex app-server client from the ground up.

**T01** established the module structure and implemented `dynamic_tool.rs` as a complete port of the Elixir `DynamicTool` module. The key design was executor injection: `execute()` accepts a generic `Fn(String, Value) -> Fut + Clone + Send` so the `linear_graphql` path is fully testable without a real Linear API. `graphql_raw` was extracted from `LinearClient::graphql` via a shared `graphql_http` helper — `graphql` retains GraphQL-error promotion for internal callers while `graphql_raw` returns the raw body for dynamic tool error inspection. 14 tests proved all argument normalisation paths, error formatting, and the full tool_specs contract.

**T02** replaced the T01 stubs with the real `app_server.rs` implementation. `validate_workspace_cwd` uses two path representations: `path_safety::canonicalize` (follows symlinks) for containment checks and `expand_path_no_symlinks` (normalizes `.`/`..` only) for escape detection — this mirrors the Elixir dual-path logic exactly. The subprocess is launched via `bash -lc <command>` with `tokio::process::Command`; stderr is drained by a fire-and-forget `tokio::spawn` task to prevent stdout stream pollution. The 4-message handshake (`initialize` with `experimentalApi:true` → `initialized` → `thread/start` with `dynamicTools` → `turn/start`) was implemented with per-iteration `tokio::time::timeout` read semantics. Turn streaming terminates on `turn/completed`, `turn/failed`, `turn/cancelled`, subprocess EOF (`PortExit`), or turn timeout. Added partial-line buffering test (60KB line via `dd`). 8 new tests (22 total).

**T03** completed the turn stream handler with all §10.5 behaviors. Approval auto-approve covers four methods (`item/commandExecution/requestApproval` → `acceptForSession`, `execCommandApproval` → `approved_for_session`, `applyPatchApproval` → `approved_for_session`, `item/fileChange/requestApproval` → `acceptForSession`). Tool call dispatch calls `dynamic_tool::execute` and sends the result back on stdin; the `graphql_executor` parameter uses `Fn + Clone` so multiple tool calls per turn work correctly. User-input handling tries approval-option extraction first (MCP tool approval prompts) then falls back to `NON_INTERACTIVE_ANSWER`; if question IDs are absent the turn hard-fails with `TurnInputRequired`. Token accounting was extracted into `src/codex/token_accounting.rs` and threaded through the receive loop as turn-local accumulators, returned in `TurnResult`. 10 new tests (32 total).

## Verification

```
cargo test --test codex_tests
# 32 passed; 0 failed; finished in 2.27s

cargo build
# zero errors, zero warnings
```

32 tests cover all S05 must-haves:
- Workspace cwd validation: root rejection, outside-root rejection, symlink escape rejection
- Full handshake sequence with fake subprocess
- Turn completion, failure, cancellation, subprocess exit
- Partial-line buffering (60KB line)
- Approval auto-approve (4 methods) and rejection
- MCP tool approval prompt auto-answer
- Freeform user-input non-interactive answer
- `TurnInputRequired` hard failure
- Unsupported tool call rejection (returns supported list)
- Supported tool call dispatch (`linear_graphql` success path)
- Tool call failure event emission
- Token delta extraction from absolute totals
- Token delta zero-on-decrease guard
- All 14 `linear_graphql` argument validation + error formatting paths

## Requirements Advanced

- R005 (Codex App-Server Client) — fully proven: subprocess launch, handshake, turn streaming, all approval/tool/user-input handlers, timeout enforcement, all terminal conditions, token extraction
- R012 (linear_graphql dynamic tool) — fully proven: argument validation, GraphQL execution via graphql_raw, error formatting, executor injection for testability
- R015 (Token Accounting and Rate Limit Tracking) — proven at per-turn level: delta extraction from nested payload paths, zero-on-decrease guard, rate limit extraction; aggregate accumulation into OrchestratorState deferred to S06

## Requirements Validated

- R005 — cargo test proves all §10 behaviors; validated
- R012 — cargo test proves all linear_graphql paths including error formatting; validated

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- `start_session` signature gained `workspace_root: &Path` parameter (not in T01 stub) — `CodexConfig` has no workspace root field; the caller (orchestrator in S06) owns `WorkspaceConfig` and can pass both. Decision recorded in DECISIONS.md.
- `TurnResult` expanded with `input_tokens`, `output_tokens`, `rate_limits` fields beyond the original single `total_tokens` stub. Required for completeness; S06 consumes all fields.
- `run_turn` parameter order is `(handle, prompt, graphql_executor, event_callback)` — executor before callback, matching convention of "inputs before observers".
- `TurnResult` gained `#[derive(Debug)]` — needed by test assert! format strings.

## Known Limitations

- Token accounting is per-turn only; aggregate `codex_totals` accumulation into `OrchestratorState` is S06 scope.
- `graphql_executor` is injected by the caller — S06 must construct the `LinearClient` reference and close over it when wiring `run_turn` into the orchestrator dispatch loop.
- Rate limit extraction is captured per-turn in `TurnResult`; surfacing to the HTTP dashboard is S07 scope.
- SSH transport variant for remote workers is S08 scope (the protocol implemented here is local stdio only).

## Follow-ups

- S06: wire `AppServerClient` session lifecycle into orchestrator dispatch loop
- S06: wire `AgentEvent` callback into running-entry state updates (stall detection, token totals)
- S06: accumulate `TurnResult` token fields into `OrchestratorState.codex_totals`
- S08: adapt `app_server.rs` session protocol for SSH stdio transport

## Files Created/Modified

- `src/codex/mod.rs` — module entry point; declares app_server, dynamic_tool, token_accounting
- `src/codex/app_server.rs` — complete implementation (~600 lines)
- `src/codex/dynamic_tool.rs` — linear_graphql implementation with executor injection (~250 lines)
- `src/codex/token_accounting.rs` — new: TokenState, TokenDelta, extract_token_delta, extract_rate_limits
- `src/linear/client.rs` — added graphql_raw (public) and graphql_http (private helper)
- `src/domain.rs` — AgentEvent enum variants (SessionStarted, TurnCompleted, TurnFailed, TurnCancelled, Notification, OtherMessage, Malformed, ApprovalRequired, ApprovalAutoApproved, ToolCallCompleted, ToolCallFailed, UnsupportedToolCall, ToolInputAutoAnswered, TurnInputRequired)
- `src/lib.rs` — registered pub mod codex
- `tests/codex_tests.rs` — 32 integration tests

## Forward Intelligence

### What the next slice should know
- `run_turn` requires a `graphql_executor: E` where `E: Fn(String, Value) -> EFut + Clone + Send`. S06 must construct this by capturing a `LinearClient` reference (or `Arc<LinearClient>`) in a closure passed to `run_turn`.
- `start_session` needs both `config: &CodexConfig` and `workspace_root: &Path` — the orchestrator holds both (`WorkspaceConfig.root` is the root).
- `AgentEvent` callback is `FnMut(AgentEvent)` — a `Vec<AgentEvent>` accumulator or channel sender works for the orchestrator.
- `auto_approve_requests` is derived inside `start_session` from `approval_policy`; S06 does not need to handle approval policy separately.
- `TurnResult.total_tokens` is a delta (not absolute) — safe to add directly to `codex_totals` without double-counting.

### What's fragile
- `validate_workspace_cwd` uses `expand_path_no_symlinks` (custom `..`/`.` normalizer) for symlink escape detection — if the workspace path contains unusual Unicode or very deep `..` chains, edge cases may exist. The 3 CWD tests cover common cases but not exhaustively.
- `await_response` reads with per-iteration timeout (not a wall-clock deadline) — total handshake time can be up to `N × read_timeout_ms` if the subprocess emits many non-matching lines before the expected response.
- The fake shell scripts in tests use `bash` — CI must have bash available (true on macOS/Linux; not guaranteed on Windows).

### Authoritative diagnostics
- `CODEX_STDERR` tracing target at DEBUG level — first place to look when a subprocess behaves unexpectedly
- `AgentEvent::Malformed` — emitted when a line can't be parsed as JSON; the raw line is in the event
- `SymphonyError::PortExit(i32)` carries the child exit code — check this when the subprocess dies unexpectedly
- `TurnResult` fields — the ground truth for per-turn token accounting; log these in S06 dispatch loop

### What assumptions changed
- Original plan assumed `start_session` would read workspace root from `CodexConfig` — actual: `CodexConfig` has no workspace root; the caller must pass it. This is the right design (separation of concerns) but S06 must be aware.
- Original stub had `run_turn(handle, prompt, callback)` — actual signature is `run_turn(handle, prompt, executor, callback)` — the `graphql_executor` parameter is required for tool call dispatch.
