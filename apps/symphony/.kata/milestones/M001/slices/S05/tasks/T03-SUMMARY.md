---
id: T03
parent: S05
milestone: M001
provides:
  - src/codex/app_server.rs — complete §10.5 handlers: approval auto-approve/reject, item/tool/call dispatch, item/tool/requestUserInput with option-based and non-interactive answers, needs_input detection, token accounting
  - src/codex/token_accounting.rs — TokenState, TokenDelta, extract_token_delta, extract_rate_limits
  - src/domain.rs — four new AgentEvent variants (ApprovalRequired, ToolCallCompleted, ToolCallFailed, ToolInputAutoAnswered)
  - tests/codex_tests.rs — 10 new T03 integration tests (32 total, all passing)
key_files:
  - src/codex/app_server.rs
  - src/codex/token_accounting.rs
  - src/domain.rs
  - tests/codex_tests.rs
key_decisions:
  - "auto_approve_requests derived at start_session time: approval_policy == Value::String(\"never\") → auto_approve_requests=true; stored in SessionHandle; no change to run_turn caller API beyond executor parameter"
  - "run_turn<E,EFut> now takes a graphql_executor: E where E: Fn(String,Value)->EFut + Clone+Send; called as executor.clone() per tool call so Fn (not FnOnce) enables multiple tool calls per turn"
  - "TurnResult expanded: input_tokens, output_tokens, total_tokens, rate_limits fields added; old total_tokens: 0 stub replaced with real accounting"
  - "Approval rejection returns Err(SymphonyError::Other(\"approval_required\")) matching Elixir's :approval_required atom; does not stall"
  - "Token accounting in app_server accumulates turn-local deltas via token_accounting::extract_token_delta; state threaded through loop without persistent SessionHandle mutation"
  - "handle_approval_or_reject, dispatch_tool_call, handle_request_user_input are module-private async fns; not public API"
patterns_established:
  - "Approval handler pattern: match specific method str → call handle_approval_or_reject → if Ok(false) return Err immediately; Ok(true) continue loop"
  - "Token accounting pattern: call extract_token_delta after every parsed JSON payload, accumulate into turn_* locals, return in TurnResult"
  - "User-input answer pattern: try approval options first (auto_approve=true only), fall back to non-interactive answer, hard-fail if question IDs absent"
  - "graphql_executor.clone() per tool call — Fn+Clone is the pattern for multi-call executor injection in the turn loop"
observability_surfaces:
  - "ApprovalAutoApproved event: tool_call field contains the approval method name (e.g. 'item/commandExecution/requestApproval')"
  - "ApprovalRequired event: method + payload fields for downstream inspection"
  - "ToolCallCompleted/ToolCallFailed/UnsupportedToolCall events: tool_name field"
  - "ToolInputAutoAnswered event: emitted on non-interactive answer"
  - "TurnInputRequired event + SymphonyError::TurnInputRequired: hard failure with prompt text in event"
  - "TurnResult.total_tokens / input_tokens / output_tokens: cumulative token accounting per turn"
  - "tracing::debug! on approvals, tool calls; tracing::warn! on approval required and input required"
duration: ~2h
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Approval handling, tool call dispatch, user-input policy, and token accounting

**Completed all §10.5 turn-stream handlers: approval auto-approve/reject (4 methods, correct decision strings), `item/tool/call` dispatch via `dynamic_tool::execute`, `item/tool/requestUserInput` with option-based and non-interactive answers, `needs_input` detection, and per-turn token delta accounting — 32 integration tests pass, zero warnings.**

## What Happened

Extended `app_server.rs`'s receive loop with five new method arms and a token accounting layer:

**Approval handling (Step 1):** Added `handle_approval_or_reject` for four methods:
- `item/commandExecution/requestApproval` → decision `"acceptForSession"`
- `execCommandApproval` → decision `"approved_for_session"`
- `applyPatchApproval` → decision `"approved_for_session"`
- `item/fileChange/requestApproval` → decision `"acceptForSession"`
When `auto_approve_requests=true` (derived from `approval_policy == "never"`): sends `{"id":<id>,"result":{"decision":"<decision>"}}`, emits `ApprovalAutoApproved`, continues loop. When `false`: emits `ApprovalRequired`, returns `Err` immediately.

**Tool call dispatch (Step 2):** Added `dispatch_tool_call` for `item/tool/call`. Extracts tool name (from `params.tool` or `params.name`, trimmed, nil if blank) and arguments (from `params.arguments`, default `{}`). Calls `dynamic_tool::execute(name, args, executor.clone())`, normalizes result, sends back `{"id":<id>,"result":<normalized>}`. Emits `ToolCallCompleted` (success), `ToolCallFailed` (named tool failure), or `UnsupportedToolCall` (blank/missing name). Continues loop — tool calls do not terminate the turn.

**User-input handling (Step 3):** Added `handle_request_user_input` for `item/tool/requestUserInput`. Two-stage logic:
1. If `auto_approve=true`: try `build_approval_answers` — find "Approve this Session" > "Approve Once" > "approve"/"allow" prefix. If all questions have approval options, send option-based answer, emit `ApprovalAutoApproved`.
2. Otherwise: `build_non_interactive_answers` — extract question IDs, send `NON_INTERACTIVE_ANSWER` for each, emit `ToolInputAutoAnswered`. If question IDs absent: return `Ok(false)` → caller emits `TurnInputRequired` + returns `Err(TurnInputRequired)`.
Added `needs_input` detection in the "other method" arm for `turn/input_required`, `turn/needs_input`, etc. and payload flags.

**Token accounting (Step 4):** Created `src/codex/token_accounting.rs` with `TokenState`, `TokenDelta`, `extract_token_delta`, and `extract_rate_limits`. After every parsed JSON payload in the loop, call `extract_token_delta` and accumulate into `turn_input_tokens`, `turn_output_tokens`, `turn_total_tokens`. Rate limits captured into `turn_rate_limits`. All returned in expanded `TurnResult`.

**run_turn signature change:** Added `graphql_executor: E` parameter (before `event_callback`). Uses `E: Fn(String, Value) -> EFut + Clone + Send` so multiple tool calls per turn work correctly. All existing T02 tests updated to pass `never_executor`.

## Verification

```
cargo test --test codex_tests   # 32 passed, 0 failed
cargo build                     # zero errors, zero warnings
```

New T03 tests (10):
- `test_app_server_auto_approves_command_execution` ✓
- `test_app_server_rejects_approval_when_not_auto` ✓
- `test_app_server_auto_approves_mcp_tool_prompts` ✓
- `test_app_server_non_interactive_freeform_input` ✓
- `test_app_server_rejects_unsupported_tool_calls` ✓
- `test_app_server_dispatches_supported_tool_calls` ✓
- `test_app_server_emits_tool_call_failed_event` ✓
- `test_app_server_input_required_hard_failure` ✓
- `test_token_delta_extraction_absolute_totals` ✓
- `test_token_delta_zero_on_decrease` ✓

## Diagnostics

- **Approval response wire**: `{"id":<id>,"result":{"decision":"acceptForSession"}}` or `"approved_for_session"` depending on method.
- **Tool call result wire**: `{"id":<id>,"result":{"success":bool,"output":"...","contentItems":[...]}}`.
- **User input answer wire**: `{"id":<id>,"result":{"answers":{"<question_id>":{"answers":["<label_or_non_interactive>"]}}}}`
- **Token path**: `params.tokenUsage.total.{input_tokens,output_tokens,total_tokens}` is the primary absolute path tested. All Elixir-equivalent paths also checked.
- **Failure state**: `SymphonyError::TurnInputRequired` carries no message body (unit variant); `AgentEvent::TurnInputRequired.prompt` carries the raw JSON line (truncated to 1000 chars).

## Deviations

- `TurnResult` expanded with `input_tokens`, `output_tokens`, `rate_limits` fields beyond the original single `total_tokens`. Required for completeness; S06 uses all fields.
- `run_turn` parameter order is `(handle, prompt, graphql_executor, event_callback)` — executor before callback, matching convention of "inputs before observers".

## Known Issues

None.

## Files Created/Modified

- `src/codex/app_server.rs` — approval/tool/user-input handlers, token accounting wired into loop, run_turn signature updated (~600 lines total)
- `src/codex/token_accounting.rs` — new: TokenState, TokenDelta, extract_token_delta, extract_rate_limits, unit tests
- `src/codex/mod.rs` — added `pub mod token_accounting`
- `src/domain.rs` — four new AgentEvent variants: ApprovalRequired, ToolCallCompleted, ToolCallFailed, ToolInputAutoAnswered
- `tests/codex_tests.rs` — 10 new T03 integration tests, all existing tests updated with executor parameter
