# S05: Codex App-Server Client — UAT

**Milestone:** M001
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S05 has no live runtime requirement — the spec explicitly allows fake Codex subprocess scripts to simulate the protocol. All behaviors are fully exercised by 32 deterministic integration tests using tempfile bash scripts; no real Codex binary or Linear API is needed to prove correctness. Human/UAT was explicitly marked "no" in the slice plan.

## Preconditions

- `cargo build` succeeds with zero errors and zero warnings
- `bash` is available on the PATH (tests use fake bash scripts in tempfiles)
- `tests/codex_tests.rs` is the integration test file

## Smoke Test

```bash
cd apps/symphony
cargo test --test codex_tests 2>&1 | tail -5
# Expected: "test result: ok. 32 passed; 0 failed"
```

## Test Cases

### 1. dynamic_tool — linear_graphql argument validation and execution

```bash
cargo test --test codex_tests linear_graphql
```

Expected: all 11 `linear_graphql_*` tests pass. Covers:
- Raw query string accepted, blank string rejected
- Object form: query+variables accepted, missing/blank query rejected
- Non-object variables rejected
- GraphQL errors preserved with `success=false`
- Empty errors array treated as success
- Transport/auth/missing-token failures formatted correctly
- Unexpected executor failures formatted correctly
- `operationName` field ignored

### 2. dynamic_tool — unsupported tool and tool_specs contract

```bash
cargo test --test codex_tests unsupported_tool
cargo test --test codex_tests tool_specs_contract
cargo test --test codex_tests tool_result_always_has_content_items
```

Expected: 3 tests pass. Unsupported tool returns `success=false` with supported-tool list in output. `tool_specs()` returns exactly `[{name:"linear_graphql", inputSchema:{required:["query"]}}]`. `contentItems` always matches `output`.

### 3. app_server — workspace cwd validation

```bash
cargo test --test codex_tests test_app_server_cwd
```

Expected: 3 tests pass — `start_session` returns `Err(InvalidWorkspaceCwd)` when workspace == root, workspace is outside root, or workspace path escapes root via symlink.

### 4. app_server — full handshake and turn completion

```bash
cargo test --test codex_tests test_app_server_basic_handshake_and_completion
```

Expected: 1 test passes. Session ID is `thread-abc-123-turn-xyz-456`. `TurnResult.output` contains `"Hello from fake codex"`. Fake script receives: `initialize(id=1)`, `initialized`, `thread/start(id=2)`, `turn/start(id=3)` in order.

### 5. app_server — turn failure, cancellation, subprocess exit

```bash
cargo test --test codex_tests test_app_server_turn_failure
cargo test --test codex_tests test_app_server_turn_cancellation
cargo test --test codex_tests test_app_server_subprocess_exit
```

Expected: 3 tests pass. Turn failure → `Err(TurnFailed(...))`. Turn cancellation → `Err(TurnCancelled(...))`. Subprocess exit mid-turn → `Err(PortExit(...))`.

### 6. app_server — partial-line buffering

```bash
cargo test --test codex_tests test_app_server_partial_line_buffering
```

Expected: 1 test passes. A ~60KB JSON line is parsed correctly without truncation.

### 7. app_server — approval auto-approve and rejection

```bash
cargo test --test codex_tests test_app_server_auto_approves_command_execution
cargo test --test codex_tests test_app_server_rejects_approval_when_not_auto
```

Expected: 2 tests pass. `auto_approve=true` → sends `{decision:"acceptForSession"}` and emits `ApprovalAutoApproved`. `auto_approve=false` → emits `ApprovalRequired` and returns `Err(Other("approval_required"))`.

### 8. app_server — tool call dispatch and failure

```bash
cargo test --test codex_tests test_app_server_dispatches_supported_tool_calls
cargo test --test codex_tests test_app_server_rejects_unsupported_tool_calls
cargo test --test codex_tests test_app_server_emits_tool_call_failed_event
```

Expected: 3 tests pass. Supported tool call → result sent back on stdin, `ToolCallCompleted` emitted. Unsupported → `UnsupportedToolCall` emitted, failure result sent back. Executor failure → `ToolCallFailed` emitted.

### 9. app_server — user-input handling

```bash
cargo test --test codex_tests test_app_server_auto_approves_mcp_tool_prompts
cargo test --test codex_tests test_app_server_non_interactive_freeform_input
cargo test --test codex_tests test_app_server_input_required_hard_failure
```

Expected: 3 tests pass. MCP tool approval prompt with options → approval option auto-selected. Freeform question → `NON_INTERACTIVE_ANSWER` sent, `ToolInputAutoAnswered` emitted. No question IDs → `TurnInputRequired` hard failure.

### 10. Token accounting

```bash
cargo test --test codex_tests test_token_delta
```

Expected: 2 tests pass. Absolute totals in nested payload paths produce correct delta. Token count never reported as negative (zero-on-decrease guard).

## Edge Cases

### Partial-line buffering (60KB line)

1. Fake script outputs a `~60KB` base64-like payload in a single JSON turn/completed line
2. **Expected:** `start_session` + `run_turn` succeed; `TurnResult.output` contains the full content

### Token delta zero-on-decrease

1. Inject a token event where total_tokens < last reported value
2. **Expected:** `extract_token_delta` returns delta=0 (not negative); no panic

### Symlink escape rejection

1. Create symlink pointing outside workspace root, use as workspace cwd
2. **Expected:** `start_session` returns `Err(InvalidWorkspaceCwd)` before spawning subprocess

## Failure Signals

- Any test in `cargo test --test codex_tests` failing indicates a regression in the app_server protocol, dynamic_tool dispatch, or token accounting
- `cargo build` warnings about unused imports/variables indicate incomplete cleanup
- A fake script test hanging (timeout) indicates the handshake or turn stream loop has a deadlock — check `await_response` and the receive loop timeout logic
- `Err(Other("not yet implemented"))` in test output means a stub was not replaced

## Requirements Proved By This UAT

- R005 (Codex App-Server Client) — subprocess launch, bash -lc spawn with workspace cwd, 4-message handshake, turn streaming (completed/failed/cancelled/timeout/exit), approval auto-approve/reject (4 methods), tool call dispatch, user-input handling (MCP approval + freeform + hard-fail), partial-line buffering, turn timeout enforcement, all terminal conditions
- R012 (linear_graphql dynamic tool) — argument normalisation (string/object/invalid), query validation, variables validation, GraphQL execution via graphql_raw, GraphQL error preservation, transport/auth error formatting, executor injection for testability
- R015 (Token Accounting — per-turn) — delta extraction from nested payload paths (`tokenUsage.total.*`, `total_token_usage.*`), zero-on-decrease guard, rate limit extraction, fields returned in TurnResult

## Not Proven By This UAT

- R015 (aggregate token totals) — `OrchestratorState.codex_totals` accumulation is S06 scope; this UAT only proves per-turn delta extraction
- R005 (turn stall detection) — stall timeout (read_timeout_ms per-iteration) is proven for basic timeout but not under realistic multi-minute wall-clock conditions; S06 integration proves operational behavior
- R006, R008 (orchestrator loop, CLI wiring) — not in scope for S05
- R011 (SSH transport) — S05 implements local stdio only; SSH variant is S08 scope
- Real Codex binary compatibility — proven against fake shell scripts; field name drift with real app-server binary is a known risk (spec §key-risk "Codex app-server protocol shape drift") deferred to S06 integration

## Notes for Tester

- All tests are fully automated via `cargo test --test codex_tests` — no manual steps required
- Fake Codex scripts are written to `tempfile::tempdir()` per test; no leftover files
- Tests require `bash` on PATH (standard on macOS and Linux)
- The `graphql_executor` parameter in `run_turn` is a closure — tests pass `never_executor` (always panics) for tests that don't exercise tool calls; `echo_executor` or a custom closure for tests that do
- Token accounting tests inject payloads directly into `extract_token_delta` — they do not need a subprocess
