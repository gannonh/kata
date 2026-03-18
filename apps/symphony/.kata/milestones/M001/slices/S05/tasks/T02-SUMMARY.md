---
id: T02
parent: S05
milestone: M001
provides:
  - src/codex/app_server.rs — complete subprocess launch, handshake (initialize→initialized→thread/start), and turn streaming (~360 lines); replaces T01 stubs
  - tests/codex_tests.rs — 8 new app_server tests (22 cumulative), covering workspace cwd validation, full handshake, turn/completed, turn/failed, turn/cancelled, subprocess exit, partial-line buffering
key_files:
  - src/codex/app_server.rs
  - tests/codex_tests.rs
key_decisions:
  - "`start_session` takes `workspace_root: &Path` as an explicit parameter (not read from config) — CodexConfig has no workspace root field; caller (orchestrator) knows the root and passes it directly. Matches Elixir's Config.settings!().workspace.root pattern in spirit."
  - "Issue metadata (id, identifier, title) stored in SessionHandle at start_session time — run_turn has no issue parameter; handle carries all state needed for turn/start title and logging. Keeps run_turn signature minimal and consistent with T01 stub."
  - "`TurnResult` derives Debug to allow assert! format strings in tests."
  - "stderr drained by a fire-and-forget tokio::spawn task (logs at DEBUG); not merged into stdout stream (unlike Elixir :stderr_to_stdout). Full stderr logging captured without polluting the JSON-RPC stdout stream."
  - "Each `await_response` read_line call uses the full `read_timeout_ms` per iteration (matches Elixir per-receive timeout semantics, not a wall-clock deadline). Total handshake wait can be up to N×read_timeout_ms but is inconsequential in practice."
patterns_established:
  - "Subprocess I/O pattern: take stdin/stdout from Child before constructing SessionHandle; store as typed fields. Kill child in start_session error path before returning error."
  - "Receive loop pattern: tokio::time::timeout wrapping read_line for turn_timeout; EOF (0 bytes) → wait child for PortExit; JSON parse failure → Malformed event + continue; non-matching method → Notification event + continue."
  - "`validate_workspace_cwd` uses two path representations: canonical (symlink-resolved via path_safety::canonicalize) for containment check, and expanded-no-symlinks for escape detection. Mirrors Elixir's dual-path cond logic exactly."
observability_surfaces:
  - "tracing::info! on session start (session_id, issue_id, issue_identifier) and turn complete"
  - "tracing::warn! on turn failure, cancellation, timeout, subprocess exit"
  - "tracing::debug! for non-JSON stdout lines, notifications, ignored handshake messages, stderr"
  - "AgentEvent variants emitted via callback: SessionStarted, TurnCompleted, TurnFailed, TurnCancelled, Notification, OtherMessage, Malformed"
  - "SymphonyError variants with context: InvalidWorkspaceCwd(msg), PortExit(status), ResponseTimeout, TurnTimeout, TurnFailed(params_json), TurnCancelled(params_json)"
duration: ~1 session
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: App-server subprocess launch, handshake, and basic turn streaming

**Replaced app_server.rs stubs with real subprocess lifecycle: workspace validation, bash -lc spawn, 4-message JSON-RPC handshake, and line-delimited turn streaming; all 8 must-have behaviors verified by 22 passing tests.**

## What Happened

Implemented `src/codex/app_server.rs` in full, replacing the T01 stubs with:

1. **`validate_workspace_cwd`** — rejects workspace == root, workspace outside root, and symlink escapes. Uses two path representations: `path_safety::canonicalize` for containment (follows symlinks) and `expand_path_no_symlinks` for escape detection (normalizes `.`/`..` only). Maps all rejection cases to `SymphonyError::InvalidWorkspaceCwd`.

2. **Subprocess launch** — `bash -lc <command.join(" ")>` via `tokio::process::Command` with stdin/stdout/stderr piped. stderr is drained by a fire-and-forget `tokio::spawn(drain_stderr(...))` task that logs at DEBUG. Child PID captured for event metadata.

3. **Startup handshake** (`do_start_session`) — sends `initialize(id=1)` with `experimentalApi: true` and `clientInfo`, awaits response, sends `initialized` notification (no id), sends `thread/start(id=2)` with `approvalPolicy`, `sandbox`, `cwd`, and `dynamicTools` from `tool_specs()`, awaits response and extracts `result.thread.id`. `await_response` reads with per-iteration `tokio::time::timeout(read_timeout_ms)`, skips non-matching IDs, and loops past non-JSON lines.

4. **Turn streaming** (`run_turn`) — sends `turn/start(id=3)` with `threadId`, `input`, `cwd`, `title = "{identifier}: {title}"`, `approvalPolicy`, `sandboxPolicy`. Awaits response, extracts `result.turn.id`, updates `handle.session_id` to `thread_id-turn_id`, emits `AgentEvent::SessionStarted`. Receive loop: `tokio::time::timeout(turn_timeout_ms)` per iteration; `turn/completed` → emit + Ok; `turn/failed`/`turn/cancelled` → emit + Err; other methods → Notification event + continue; non-JSON → Malformed event + continue; EOF → PortExit(status); timeout → TurnTimeout.

5. **`stop_session`** — drops stdin (EOF signal), kills child, waits.

Added 8 app_server tests in `tests/codex_tests.rs` using fake bash scripts (written to tempfiles, chmod 755):
- 3 CWD validation tests (root, outside, symlink escape)
- basic handshake + completion (verifies session_id = "thread-abc-123-turn-xyz-456")
- turn/failed (verifies TurnFailed error + event)
- turn/cancelled (verifies TurnCancelled error + event)
- subprocess exit (verifies PortExit error)
- partial-line buffering: ~60KB line via `dd if=/dev/zero | tr '\0' 'a'`, parsed correctly

**Deviation**: Added `workspace_root: &Path` parameter to `start_session` (not in stub signature) — required because `CodexConfig` has no workspace root field. Decision recorded above.

## Verification

```
cargo test --test codex_tests
# running 22 tests
# 14 dynamic_tool tests (T01) + 8 app_server tests (T02)
# test result: ok. 22 passed; 0 failed

cargo build
# Finished dev profile — zero errors, zero warnings
```

All 8 T02 must-haves confirmed:
- [x] `start_session` validates cwd (rejects root, outside, symlink escape)
- [x] Subprocess launched via `bash -lc` with workspace as cwd, stdin/stdout piped
- [x] Handshake sends initialize(id=1)→initialized→thread/start(id=2) in order
- [x] `initialize` includes `experimentalApi: true` and clientInfo
- [x] `thread/start` includes dynamicTools from `tool_specs()`
- [x] Thread ID extracted from `result.thread.id`
- [x] `turn/start` sends prompt as text input, cwd, title = `<identifier>: <title>`, approval/sandbox policies
- [x] Turn ID extracted from `result.turn.id`, session_id = `<thread_id>-<turn_id>`
- [x] Turn terminates correctly on: turn/completed, turn/failed, turn/cancelled, subprocess exit
- [x] Partial-line buffering works (60KB line test passes)
- [x] AgentEvent emitted for session_started, turn_completed, turn_failed, turn_cancelled
- [x] ≥8 app_server tests pass (exactly 8 new tests, 22 total)

## Diagnostics

- Inspect session lifecycle: `tracing::info!` events include `session_id`, `issue_id`, `issue_identifier`
- Subprocess stderr: logged at `CODEX_STDERR` target via DEBUG
- Test trace: fake scripts write predictable IDs (`thread-abc-123`, `turn-xyz-456`) for exact assertion
- Failure shapes: `SymphonyError::TurnFailed(params_json)` — the raw params from the `turn/failed` message; `PortExit(i32)` — child exit code

## Deviations

- `start_session` signature changed from stub: added `workspace_root: &Path` parameter. CodexConfig has no workspace root; it belongs to WorkspaceConfig. Caller passes both. Decision recorded in .kata/DECISIONS.md.
- `TurnResult` gained `#[derive(Debug)]` — needed by test assert! format strings.

## Known Issues

None. T03 scope (approval handling, tool calls, user-input, token accounting) is unaffected.

## Files Created/Modified

- `src/codex/app_server.rs` — complete implementation (~360 lines); replaces T01 stubs
- `tests/codex_tests.rs` — added app_server imports and 8 new tests (file grows from ~430 to ~740 lines)
