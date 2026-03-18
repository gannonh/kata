# S05: Codex App-Server Client

**Goal:** Implement the Codex app-server JSON-RPC client: subprocess launch via `bash -lc`, startup handshake (initialize→initialized→thread/start→turn/start), line-delimited turn streaming with event extraction, approval/tool-call/user-input handling, timeout enforcement (read + turn), token accounting with delta extraction, and the `linear_graphql` dynamic tool extension.
**Demo:** `cargo test --test codex_tests` proves subprocess launch with fake Codex binary, full handshake sequence, turn completion/failure/cancellation, approval auto-approve and rejection, dynamic tool call dispatch (supported + unsupported), user-input handling, partial-line buffering, timeout enforcement, token delta extraction, and `linear_graphql` argument validation + execution + error formatting.

## Must-Haves

- `codex/app_server.rs` exists with `start_session`, `run_turn`, `stop_session` public functions
- `codex/dynamic_tool.rs` exists with `execute`, `tool_specs` public functions and `linear_graphql` support
- Subprocess launched via `bash -lc <codex.command>` with workspace as cwd
- Startup handshake sends initialize→initialized→thread/start in order, extracts thread_id
- `turn/start` sends prompt, cwd, title (`<identifier>: <title>`), approval/sandbox policies
- Line-delimited JSON streaming from stdout with partial-line buffering
- Turn terminates on: `turn/completed` (success), `turn/failed` (failure), `turn/cancelled` (failure), turn timeout, subprocess exit
- Approval requests auto-approved when `auto_approve=true`, returned as error when `auto_approve=false`
- `item/tool/call` dispatches to `dynamic_tool::execute` and returns result on stdio
- `item/tool/requestUserInput` with approval options auto-answers; freeform gets non-interactive response
- Unsupported tool calls return failure payload without stalling
- `linear_graphql` tool validates query (non-empty string), optional variables (must be object), executes via `LinearClient::graphql_raw`, returns structured result
- Token accounting: extract absolute totals from nested payload paths, compute deltas vs last-reported, return `TokenDelta` struct
- Rate limit extraction from event payloads
- `AgentEvent` emitted for all §10.4 event types
- All spec §10.6 error categories mapped to `SymphonyError` variants

## Proof Level

- This slice proves: contract (unit + integration tests against fake Codex subprocess scripts)
- Real runtime required: no (fake shell scripts simulate Codex app-server protocol)
- Human/UAT required: no

## Verification

- `cargo test --test codex_tests` — all integration tests pass (target: ~25 tests)
- `cargo build` — zero errors, zero warnings
- Dynamic tool tests cover: unsupported tool failure, `linear_graphql` success, `linear_graphql` missing query, `linear_graphql` invalid arguments, `linear_graphql` invalid variables, `linear_graphql` GraphQL errors, `linear_graphql` transport failures
- App-server tests cover: workspace cwd validation, handshake sequence, turn completion, turn failure, turn cancellation, turn timeout, approval auto-approve, approval rejection, user-input auto-approve for MCP tool prompts, user-input non-interactive answer for freeform, unsupported tool call rejection, supported tool call dispatch, partial-line buffering, subprocess exit, token delta extraction
- At least one test verifies structured error variant carries the correct context fields

## Observability / Diagnostics

- Runtime signals: `tracing::info!` on session start/complete with `issue_id`, `session_id`; `tracing::warn!` on session failure with error reason; `tracing::debug!` for non-JSON stdout lines and notification events
- Inspection surfaces: `AgentEvent` enum variants emitted via callback — the orchestrator (S06) will consume these for state updates
- Failure visibility: `SymphonyError` variants carry typed context (exit status for `PortExit`, timeout_ms implicitly from config, method/params for `TurnFailed`/`TurnCancelled`/`TurnInputRequired`)
- Redaction constraints: None for this slice (no secrets in Codex protocol messages). `LinearClient::graphql_raw` inherits the existing api_key redaction from S03.

## Integration Closure

- Upstream surfaces consumed:
  - `domain.rs` → `CodexConfig`, `Issue`, `AgentEvent`, `LiveSession` token fields
  - `error.rs` → `SymphonyError` Codex-related variants
  - `path_safety.rs` → `validate_workspace_path`, `canonicalize` for cwd validation before launch
  - `linear/client.rs` → new `graphql_raw` public method for `linear_graphql` tool
- New wiring introduced in this slice:
  - `codex/` module directory with `app_server.rs` and `dynamic_tool.rs`
  - `LinearClient::graphql_raw` exposed as public API (wrapping existing private `graphql` method)
  - `lib.rs` updated to register `pub mod codex`
- What remains before the milestone is truly usable end-to-end:
  - S06 wires `AppServerClient` into orchestrator dispatch loop
  - S06 wires `AgentEvent` callback into running-entry state updates
  - S06 wires token accounting into `OrchestratorState.codex_totals`
  - S08 adds SSH transport variant for remote workers

## Tasks

- [x] **T01: Integration test suite and dynamic_tool module** `est:45m`
  - Why: Establish the test infrastructure with fake Codex shell scripts, and implement the `linear_graphql` dynamic tool (self-contained, no subprocess needed). Tests for dynamic_tool should pass; app_server tests compile but fail (stubs).
  - Files: `tests/codex_tests.rs`, `src/codex/mod.rs`, `src/codex/dynamic_tool.rs`, `src/codex/app_server.rs` (stub), `src/linear/client.rs`, `src/lib.rs`
  - Do: Create `codex/` module structure. Implement `dynamic_tool.rs` with `tool_specs()` and `execute()` matching Elixir behavior: unsupported tools return failure with supported list, `linear_graphql` validates query/variables, executes via `LinearClient::graphql_raw`, normalizes results with success/output/contentItems. Add `graphql_raw` public method to `LinearClient`. Write all dynamic_tool tests (~12) and the initial app_server test stubs. Register `pub mod codex` in `lib.rs`.
  - Verify: `cargo test --test codex_tests` — all dynamic_tool tests pass, app_server stubs compile
  - Done when: `dynamic_tool::execute` handles all Elixir test cases, `linear_graphql` argument validation + execution + error formatting proven

- [x] **T02: App-server subprocess launch, handshake, and basic turn streaming** `est:45m`
  - Why: Core session lifecycle — launch subprocess, perform the 4-message handshake, stream turn events until completion/failure/cancellation/timeout/exit. This is the backbone that T03 builds approval/tool handling on top of.
  - Files: `src/codex/app_server.rs`, `tests/codex_tests.rs`
  - Do: Implement `start_session` (validate cwd via `path_safety`, spawn `bash -lc` with workspace cwd, send initialize→wait for response→send initialized→send thread/start→extract thread_id). Implement `run_turn` (send turn/start→extract turn_id→stream lines with partial buffering→dispatch on method: turn/completed, turn/failed, turn/cancelled→enforce turn timeout). Implement `stop_session` (kill child process). Emit `AgentEvent` variants via callback. Write fake Codex shell scripts for: basic handshake+completion, turn failure, turn cancellation, subprocess exit, partial-line buffering, cwd validation rejection.
  - Verify: `cargo test --test codex_tests` — all T02 app_server tests pass (~8 tests)
  - Done when: Full session lifecycle (start→turn→stop) works with fake subprocess, all terminal conditions handled

- [x] **T03: Approval handling, tool call dispatch, user-input policy, and token accounting** `est:45m`
  - Why: Complete the turn event handler with approval auto-approve/reject, dynamic tool call dispatch, user-input handling (MCP approval prompts and freeform), and token delta extraction from event payloads. This finishes all S05 must-haves.
  - Files: `src/codex/app_server.rs`, `tests/codex_tests.rs`
  - Do: Extend turn stream handler to dispatch approval methods (item/commandExecution/requestApproval, execCommandApproval, applyPatchApproval, item/fileChange/requestApproval) with auto-approve or rejection based on config. Handle `item/tool/call` by extracting tool name/arguments, dispatching to `dynamic_tool::execute`, sending result back on stdin. Handle `item/tool/requestUserInput` with approval-option auto-answer (prefer "Approve this Session") and freeform non-interactive answer. Implement token delta extraction: search nested payload paths for absolute totals (total_token_usage, tokenUsage.total), compute delta vs last-reported. Implement rate limit extraction. Write tests for: approval auto-approve, approval required, MCP tool approval prompt, freeform input non-interactive answer, unsupported tool rejection, supported tool dispatch, tool call failure event, token delta extraction.
  - Verify: `cargo test --test codex_tests` — all tests pass, `cargo build` zero warnings
  - Done when: All §10.5 approval/tool/input behaviors proven, token accounting produces correct deltas, all S05 must-haves verified

## Files Likely Touched

- `src/codex/mod.rs` — module declaration
- `src/codex/app_server.rs` — subprocess launch, handshake, turn streaming, approval/tool handling
- `src/codex/dynamic_tool.rs` — tool_specs, execute, linear_graphql
- `src/linear/client.rs` — add `graphql_raw` public method
- `src/lib.rs` — register `pub mod codex`
- `src/error.rs` — potential refinements to Codex error variants
- `tests/codex_tests.rs` — full integration test suite (~25 tests)
