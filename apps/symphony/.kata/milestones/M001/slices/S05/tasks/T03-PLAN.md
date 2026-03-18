---
estimated_steps: 5
estimated_files: 3
---

# T03: Approval handling, tool call dispatch, user-input policy, and token accounting

**Slice:** S05 — Codex App-Server Client
**Milestone:** M001

## Description

Complete the turn event handler with all §10.5 behaviors: approval request auto-approve/reject, dynamic tool call dispatch via `dynamic_tool::execute`, user-input handling (MCP approval prompts with option auto-answer, freeform with non-interactive response), and token accounting (absolute total extraction with delta computation). This finishes all S05 must-haves.

## Steps

1. Implement approval request handling in the turn stream loop. Match on methods:
   - `item/commandExecution/requestApproval` → approve with `"acceptForSession"` or reject
   - `execCommandApproval` → approve with `"approved_for_session"` or reject
   - `applyPatchApproval` → approve with `"approved_for_session"` or reject
   - `item/fileChange/requestApproval` → approve with `"acceptForSession"` or reject
   - When `auto_approve=true`: send `{"id": <id>, "result": {"decision": "<decision>"}}`, emit `ApprovalAutoApproved` event, continue loop
   - When `auto_approve=false`: emit `ApprovalRequired` event, return `Err` (do NOT stall)
   - Decision string varies by method (acceptForSession vs approved_for_session) — match Elixir exactly.
2. Implement `item/tool/call` handling:
   - Extract tool name from `params.tool` or `params.name` (lenient extraction, trim, nil if blank)
   - Extract arguments from `params.arguments` (default to empty map)
   - Call `dynamic_tool::execute(name, arguments, executor)` where executor is the injected GraphQL function
   - Normalize result: ensure `output` and `contentItems` fields present (matching Elixir's `normalize_dynamic_tool_result`)
   - Send result back: `{"id": <id>, "result": <normalized_result>}`
   - Emit `ToolCallCompleted`, `ToolCallFailed`, or `UnsupportedToolCall` event based on result success + tool name
   - Continue the loop (tool calls do NOT terminate the turn)
3. Implement `item/tool/requestUserInput` handling:
   - When `auto_approve=true` AND questions have option-based answers with an approval label (prefer "Approve this Session" > "Approve Once" > any label starting with "approve"/"allow"):
     - Send `{"id": <id>, "result": {"answers": {<question_id>: {"answers": [<label>]}}}}`, emit `ApprovalAutoApproved`, continue
   - When `auto_approve=false` OR questions are freeform (no matching approval options):
     - If question IDs are extractable: send non-interactive answer `"This is a non-interactive session. Operator input is unavailable."` for each question, emit `ToolInputAutoAnswered`, continue
     - If question IDs are not extractable: emit `TurnInputRequired`, return error (hard failure)
   - Also detect generic `needs_input` patterns from other turn methods (turn/input_required, requiresInput=true, etc.) — return hard failure
4. Implement token accounting as a separate helper module/functions:
   - `extract_token_delta(last_reported: &TokenState, event_payload: &Value) -> TokenDelta`:
     - Search nested payload paths for absolute totals (matching Elixir's path list: params.msg.payload.info.total_token_usage, params.tokenUsage.total, tokenUsage.total)
     - Also check `turn/completed` usage maps directly
     - Extract input_tokens/output_tokens/total_tokens (accept snake_case, camelCase, prompt_tokens/completion_tokens aliases)
     - Compute delta: if next_total >= last_reported, delta = next_total - last_reported; else 0
     - Return `TokenDelta { input_tokens, output_tokens, total_tokens, input_reported, output_reported, total_reported }`
   - `extract_rate_limits(payload: &Value) -> Option<Value>`: look for rate_limits map with limit_id/limit_name + bucket fields (primary/secondary/credits)
   - Wire token extraction into the turn stream: after each event, extract deltas and accumulate.
5. Write tests in `tests/codex_tests.rs`:
   - `test_app_server_auto_approves_command_execution` — fake script sends approval request, verify approval response in trace
   - `test_app_server_rejects_approval_when_not_auto` — approval required error returned
   - `test_app_server_auto_approves_mcp_tool_prompts` — fake script sends item/tool/requestUserInput with approval options
   - `test_app_server_non_interactive_freeform_input` — freeform prompt gets generic answer
   - `test_app_server_rejects_unsupported_tool_calls` — unsupported tool returns failure, turn continues
   - `test_app_server_dispatches_supported_tool_calls` — linear_graphql tool call dispatched, result returned
   - `test_app_server_emits_tool_call_failed_event` — tool executor returns failure, event emitted
   - `test_app_server_input_required_hard_failure` — turn/input_required method → hard error
   - `test_token_delta_extraction_absolute_totals` — absolute usage at nested paths, delta computed correctly
   - `test_token_delta_zero_on_decrease` — delta is 0 when next < prev (not negative)

## Must-Haves

- [ ] Approval auto-approve sends correct decision string per method (acceptForSession vs approved_for_session)
- [ ] Approval rejection returns error without stalling
- [ ] `item/tool/call` dispatches to `dynamic_tool::execute`, sends result back, continues turn
- [ ] Unsupported tool calls return failure payload without stalling the turn
- [ ] `item/tool/requestUserInput` with approval options auto-answers (prefer "Approve this Session")
- [ ] Freeform tool input gets non-interactive answer
- [ ] `needs_input` detection works for multiple method names and payload flags
- [ ] Token delta extraction finds absolute totals at nested paths, computes delta vs last-reported
- [ ] Token delta is 0 (not negative) when next total < last reported
- [ ] Rate limit extraction identifies payloads with limit_id + bucket fields
- [ ] All S05 integration tests pass (`cargo test --test codex_tests`)
- [ ] `cargo build` — zero errors, zero warnings

## Verification

- `cargo test --test codex_tests` — all tests pass (cumulative ≥25 with T01+T02)
- `cargo build` — zero errors, zero warnings
- Trace file inspection confirms: approval responses match Elixir's exact decision strings, tool call results have success/output/contentItems, user-input answers use correct question ID structure

## Observability Impact

- Signals added/changed: `AgentEvent::ApprovalAutoApproved`, `ToolCallCompleted`, `ToolCallFailed`, `UnsupportedToolCall`, `ToolInputAutoAnswered`, `TurnInputRequired` events emitted via callback
- How a future agent inspects this: S06 orchestrator will consume `AgentEvent` to update `LiveSession` fields (last_codex_event, token counts); trace files in tests show exact wire protocol
- Failure state exposed: `SymphonyError::TurnInputRequired` for hard input-required failure; approval rejection surfaces as `ApprovalRequired` event + error return

## Inputs

- `src/codex/app_server.rs` — turn stream loop from T02 to extend
- `src/codex/dynamic_tool.rs` — `execute()` function from T01
- `src/domain.rs` — `AgentEvent` variants, `CodexConfig.approval_policy`
- Elixir reference: `lib/symphony_elixir/codex/app_server.ex` (handle_turn_method, maybe_handle_approval_request, maybe_auto_answer_tool_request_user_input, normalize_dynamic_tool_result) and `lib/symphony_elixir/orchestrator.ex` (integrate_codex_update, extract_token_delta, extract_token_usage, extract_rate_limits)

## Expected Output

- `src/codex/app_server.rs` — complete with all §10.5 approval/tool/input handlers and token accounting (~500 lines total)
- `tests/codex_tests.rs` — ≥25 total tests passing, covering all S05 must-haves
