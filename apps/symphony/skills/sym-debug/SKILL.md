---
name: sym-debug
description:
  Investigate stuck runs and execution failures by tracing Symphony, Pi runner,
  and Codex logs with issue/session identifiers; use when runs stall, retry
  repeatedly, or fail unexpectedly.
---

# Debug

## Goals

- Find why a run is stuck, retrying, or failing.
- Correlate tracker issue identity to a Pi or Codex session quickly.
- Read the right logs in the right order to isolate root cause across the
  primary Pi path and the explicit Codex app-server continuity path.

## Log Sources

- Primary runtime log file: `<logs-root>/log/symphony.log`
  - When Symphony runs with `--logs-root`, it writes rotating JSON logs under
    this path (see `apps/symphony/README.md`).
  - Includes orchestrator, agent runner, Pi RPC bridge, and Codex
    app-server lifecycle logs.
- Rotated runtime logs: `<logs-root>/log/symphony.log*`
  - Check these when the relevant run is older than the active file.
- Stdout fallback: structured JSON log stream
  - Without `--logs-root`, logs stream to stdout instead of a file.

## Correlation Keys

- `issue_identifier`: human ticket key (example: `MT-625`)
- `issue_id`: tracker internal ID (stable backend identifier)
- `session_id`: agent session identifier. For the Pi runner this is
  the stable session ID returned by pi RPC. For the Codex backend this is the
  Codex thread-turn pair (`<thread_id>-<turn_id>`).
- `agent.backend` / config backend: `kata-cli` (aliases: `kata`, `pi`) is the
  primary/default Pi path; `codex` is the explicit Codex app-server path.

These fields are emitted by Symphony runtime lifecycle logs (notably in
`apps/symphony/src/orchestrator.rs`, `apps/symphony/src/pi_agent/rpc_bridge.rs`,
and `apps/symphony/src/codex/app_server.rs`). Use them as your join keys during
debugging.

## Quick Triage (Stuck Run)

1. Confirm scheduler/worker symptoms for the ticket.
2. Find recent lines for the ticket (`issue_identifier` first).
3. Extract `session_id` from matching lines.
4. Trace that `session_id` across start, stream, completion/failure, and stall
   handling logs.
5. Decide class of failure: timeout/stall, Pi RPC/session startup failure, Codex
   app-server startup failure, turn failure, escalation/steering failure, or
   orchestrator retry loop.

## Commands

```bash
# File-log mode (`--logs-root` enabled): expand to active + rotated files.
LOG_PATHS=( ${LOG_GLOB:-log/symphony.log*} )

# 1) Narrow by ticket key (fastest entry point)
rg -n "issue_identifier=MT-625" "${LOG_PATHS[@]}"

# 2) If needed, narrow by Linear UUID
rg -n "issue_id=<linear-uuid>" "${LOG_PATHS[@]}"

# 3) Pull session IDs seen for that ticket
rg -o "session_id=[^ ;]+" "${LOG_PATHS[@]}" | sort -u

# 4) Trace one session end-to-end
rg -n "session_id=<session>" "${LOG_PATHS[@]}"

# 5) Focus on stuck/retry signals across Pi and Codex paths
rg -n "Issue stalled|scheduling retry|turn_timeout|turn_failed|pi session start failed|pi-agent read timed out|PiAgentError|Codex session failed|Codex session ended with error" "${LOG_PATHS[@]}"

# Stdout mode (startup banner shows `Logs: stdout`): use your runtime stream.
journalctl -u symphony --since "30 minutes ago" --no-pager \
  | rg -n "issue_identifier=MT-625|issue_id=<linear-uuid>|session_id=<session>|Issue stalled|scheduling retry|turn_timeout|turn_failed|pi session start failed|pi-agent read timed out|PiAgentError|Codex session failed|Codex session ended with error"

# Containerized deploys can use docker logs instead of journalctl.
docker logs <symphony-container> --since 30m 2>&1 \
  | rg -n "issue_identifier=MT-625|issue_id=<linear-uuid>|session_id=<session>|Issue stalled|scheduling retry|turn_timeout|turn_failed|pi session start failed|pi-agent read timed out|PiAgentError|Codex session failed|Codex session ended with error"
```

## Investigation Flow

1. Locate the ticket slice:
    - Search by `issue_identifier=<KEY>`.
    - If noise is high, add `issue_id=<UUID>`.
2. Establish timeline:
    - On the primary Pi path, identify first `pi-agent session started ...
      session_id=...` or `worker_started ... session_id=...` with
      `agent.backend`/config set to `kata-cli`, `kata`, or `pi`.
    - On the explicit Codex path, identify first `Codex session started ...
      session_id=...`.
    - Follow with `TurnCompleted`, `TurnEndedWithError`, `Codex session
      completed`, `ended with error`, or worker exit lines.
3. Classify the problem:
    - Stall loop: `Issue stalled ... restarting with backoff`.
    - Pi startup/RPC failure: `pi session start failed`, `spawn failed`,
      `pi-agent stdout closed unexpectedly`, `PiAgentError`, or
      `pi-agent read timed out`.
    - Codex app-server startup: `Codex session failed ...`.
    - Turn execution failure: `turn_failed`, `turn_cancelled`, `turn_timeout`,
      `ended with error`, or pi-agent `stopReason='error'`.
    - Worker crash: `Agent task exited ... reason=...`.
4. Validate scope:
    - Check whether failures are isolated to one issue/session or repeating across
      multiple tickets.
5. Capture evidence:
    - Save key log lines with timestamps, `issue_identifier`, `issue_id`, and
      `session_id`.
    - Record probable root cause and the exact failing stage.

## Reading Pi Session Logs

In Symphony's primary backend, pi-agent diagnostics are emitted into
`log/symphony.log` by `apps/symphony/src/pi_agent/rpc_bridge.rs` and keyed by
`session_id`. Read them as a lifecycle:

1. `pi-agent session started ... session_id=...`
2. `worker_started ... session_id=...` for the issue
3. Mapped agent events such as `SessionStarted`, notifications, token stats,
   escalation events, `TurnEndedWithError`, or `TurnCompleted`
4. Terminal worker result, stall detection, or retry scheduling

For one specific Pi session investigation:

1. Capture one `session_id` for the ticket.
2. Trace `rg -n "session_id=<session>" "$LOG_GLOB"`.
3. If the trace ends early, search stderr bridge messages with
   `rg -n "pi-agent-stderr|pi-agent stdout closed unexpectedly|failed to read pi-agent stdout|pi-agent read timed out|stopReason='error'" "$LOG_GLOB"`.
4. If the run involved user prompts or steering, also inspect `/api/v1/events`,
   `/api/v1/escalations`, and `steer_*` lifecycle events.
5. Pair findings with `issue_identifier` and `issue_id` from nearby lines to
   avoid mixing concurrent retries.

## Reading Codex Session Logs

When Symphony is intentionally configured for the Codex app-server backend,
Codex session diagnostics are emitted into `log/symphony.log` and keyed by
`session_id`. Read them as a lifecycle:

1. `Codex session started ... session_id=...`
2. Session stream/lifecycle events for the same `session_id`
3. Terminal event:
    - `Codex session completed ...`, or
    - `Codex session ended with error ...`, or
    - `Issue stalled ... restarting with backoff`

For one specific session investigation, keep the trace narrow:

1. Capture one `session_id` for the ticket.
2. Build a timestamped slice for only that session:
    - `rg -n "session_id=<session>" "$LOG_GLOB"`
3. Mark the exact failing stage:
    - Startup failure before stream events (`Codex session failed ...`).
    - Turn/runtime failure after stream events (`turn_*` / `ended with error`).
    - Stall recovery (`Issue stalled ... restarting with backoff`).
4. Pair findings with `issue_identifier` and `issue_id` from nearby lines to
   confirm you are not mixing concurrent retries.

Always pair session findings with `issue_identifier`/`issue_id` to avoid mixing
concurrent runs.

## Notes

- Prefer `rg` over `grep` for speed on large logs.
- Check rotated logs (`<logs-root>/log/symphony.log*`) before concluding data is
  missing.
- If required context fields are missing in new log statements, align with
  existing structured lifecycle logging in
  `apps/symphony/src/orchestrator.rs`,
  `apps/symphony/src/pi_agent/rpc_bridge.rs`, and
  `apps/symphony/src/codex/app_server.rs`.
