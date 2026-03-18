---
estimated_steps: 5
estimated_files: 3
---

# T02: App-server subprocess launch, handshake, and basic turn streaming

**Slice:** S05 — Codex App-Server Client
**Milestone:** M001

## Description

Replace the `app_server.rs` stubs with the real subprocess lifecycle: validate workspace cwd, spawn `bash -lc <codex.command>` with workspace as cwd, perform the 4-message startup handshake (initialize→initialized→thread/start→turn/start), stream line-delimited JSON from stdout with partial-line buffering, and terminate on turn/completed, turn/failed, turn/cancelled, turn timeout, or subprocess exit. Emit `AgentEvent` variants via a callback closure. Write fake Codex shell scripts to test each path.

## Steps

1. Implement workspace cwd validation in `app_server.rs`: expand workspace path, call `path_safety::canonicalize` and `path_safety::validate_workspace_path` against the configured workspace root. Reject: workspace IS the root, workspace is outside root, symlink escape. Match Elixir's `validate_workspace_cwd/2` error tuples mapped to `SymphonyError::InvalidWorkspaceCwd`.
2. Implement subprocess launch: construct `bash -lc <command>` (join CodexConfig.command with spaces), spawn via `tokio::process::Command` with stdout piped, stdin piped, stderr piped (redirect to logging). Capture child PID for metadata.
3. Implement the startup handshake:
   - `send_message`: JSON-encode + newline, write to stdin
   - `await_response(expected_id, read_timeout_ms)`: read lines from stdout with partial-line buffering (BufReader + `read_line`), parse JSON, match on `id` field, skip non-matching messages, return `result` or error. Timeout via `tokio::time::timeout`.
   - Send `initialize` (id=1, clientInfo, capabilities with experimentalApi)
   - Await response to id=1
   - Send `initialized` notification (no id)
   - Send `thread/start` (id=2, approvalPolicy, sandbox, cwd, dynamicTools from `tool_specs()`)
   - Await response to id=2, extract `result.thread.id` as `thread_id`
   - Error on invalid thread payload
4. Implement turn streaming:
   - Send `turn/start` (id=3, threadId, input text, cwd, title, approvalPolicy, sandboxPolicy)
   - Await response to id=3, extract `result.turn.id` as `turn_id`
   - Emit `AgentEvent::SessionStarted` with session_id = `<thread_id>-<turn_id>`
   - Enter receive loop: read lines from stdout with `tokio::time::timeout(turn_timeout_ms)`:
     - `turn/completed` → emit event, return `Ok(TurnResult::Completed)`
     - `turn/failed` → emit event, return `Err(TurnFailed)`
     - `turn/cancelled` → emit event, return `Err(TurnCancelled)`
     - Other methods → emit `Notification` or `OtherMessage` event, continue loop
     - Non-JSON lines → log via `tracing::debug!`/`warn!` (promote lines matching error/warn regex), emit `Malformed` event, continue
     - Timeout → return `Err(TurnTimeout)`
   - On child exit during streaming → return `Err(PortExit(status))`
5. Write tests in `tests/codex_tests.rs` using fake Codex shell scripts:
   - `test_app_server_cwd_rejects_workspace_root` — workspace = root → error
   - `test_app_server_cwd_rejects_outside_root` — workspace outside root → error
   - `test_app_server_cwd_rejects_symlink_escape` — symlink pointing outside → error
   - `test_app_server_basic_handshake_and_completion` — fake script responds to handshake, emits turn/completed
   - `test_app_server_turn_failure` — fake script emits turn/failed
   - `test_app_server_turn_cancellation` — fake script emits turn/cancelled
   - `test_app_server_subprocess_exit` — fake script exits with non-zero during turn
   - `test_app_server_partial_line_buffering` — fake script sends large response crossing line boundaries

## Must-Haves

- [ ] `start_session` validates cwd against workspace root (rejects root, outside, symlink escape)
- [ ] Subprocess launched via `bash -lc` with workspace as cwd, stdin/stdout piped
- [ ] Handshake sends initialize(id=1)→initialized→thread/start(id=2) in order
- [ ] `initialize` includes `experimentalApi: true` in capabilities and clientInfo
- [ ] `thread/start` includes dynamicTools from `tool_specs()`
- [ ] Thread ID extracted from `result.thread.id`
- [ ] `turn/start` sends prompt as text input, cwd, title = `<identifier>: <title>`, approval/sandbox policies
- [ ] Turn ID extracted from `result.turn.id`, session_id = `<thread_id>-<turn_id>`
- [ ] Turn terminates correctly on: `turn/completed`, `turn/failed`, `turn/cancelled`, subprocess exit
- [ ] Partial-line buffering works for large messages
- [ ] `AgentEvent` emitted for session_started, turn_completed, turn_failed, turn_cancelled
- [ ] ≥8 app_server tests pass in `tests/codex_tests.rs`

## Verification

- `cargo test --test codex_tests` — all T01 + T02 tests pass
- `cargo build` — zero errors, zero warnings
- Fake Codex scripts verify handshake message ordering via trace files

## Observability Impact

- Signals added/changed: `tracing::info!` on session start/complete with session_id; `tracing::warn!` on session failure; `tracing::debug!` for non-JSON stdout lines
- How a future agent inspects this: Read test trace files to verify exact JSON-RPC messages sent by the client; `AgentEvent` callback receives all lifecycle events
- Failure state exposed: `SymphonyError::InvalidWorkspaceCwd`, `PortExit(status)`, `ResponseTimeout`, `TurnTimeout`, `TurnFailed`, `TurnCancelled` with contextual information

## Inputs

- `src/codex/app_server.rs` — stubs from T01 to replace
- `src/codex/dynamic_tool.rs` — `tool_specs()` for thread/start dynamicTools
- `src/path_safety.rs` — `canonicalize`, `validate_workspace_path`
- `src/domain.rs` — `CodexConfig`, `AgentEvent`, `Issue`
- `src/error.rs` — Codex error variants
- Elixir reference: `lib/symphony_elixir/codex/app_server.ex` (start_session, start_port, do_start_session, start_thread, start_turn, receive_loop, handle_incoming)

## Expected Output

- `src/codex/app_server.rs` — complete subprocess launch, handshake, and turn streaming (~350 lines)
- `tests/codex_tests.rs` — ≥8 new app_server tests passing (cumulative ≥20 with T01)
