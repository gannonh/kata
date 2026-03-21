---
name: debug
description:
  Investigate stuck runs and execution failures by tracing Symphony and Codex
  logs with issue/session identifiers; use when runs stall, retry repeatedly, or
  fail unexpectedly.
---

# Debug

## Goals

- Find why a run is stuck, retrying, or failing.
- Correlate Linear issue identity to a Codex session quickly.
- Read the right logs in the right order to isolate root cause.

## Log Sources

- Primary runtime log file: `<logs-root>/log/symphony.log`
  - When Symphony runs with `--logs-root`, it writes rotating JSON logs under
    this path (see `apps/symphony/README.md`).
  - Includes orchestrator, agent runner, and Codex app-server lifecycle logs.
- Rotated runtime logs: `<logs-root>/log/symphony.log*`
  - Check these when the relevant run is older than the active file.
- Stdout fallback: structured JSON log stream
  - Without `--logs-root`, logs stream to stdout instead of a file.

## Correlation Keys

- `issue_identifier`: human ticket key (example: `MT-625`)
- `issue_id`: Linear UUID (stable internal ID)
- `session_id`: Codex thread-turn pair (`<thread_id>-<turn_id>`)

These fields are emitted by Symphony runtime lifecycle logs (notably in
`apps/symphony/src/orchestrator.rs` and `apps/symphony/src/codex/app_server.rs`).
Use them as your join keys during debugging.

## Quick Triage (Stuck Run)

1. Confirm scheduler/worker symptoms for the ticket.
2. Find recent lines for the ticket (`issue_identifier` first).
3. Extract `session_id` from matching lines.
4. Trace that `session_id` across start, stream, completion/failure, and stall
   handling logs.
5. Decide class of failure: timeout/stall, app-server startup failure, turn
   failure, or orchestrator retry loop.

## Commands

```bash
# Set this to your runtime log location from the Symphony startup banner.
LOG_GLOB="${LOG_GLOB:-log/symphony.log*}"

# 1) Narrow by ticket key (fastest entry point)
rg -n "issue_identifier=MT-625" "$LOG_GLOB"

# 2) If needed, narrow by Linear UUID
rg -n "issue_id=<linear-uuid>" "$LOG_GLOB"

# 3) Pull session IDs seen for that ticket
rg -o "session_id=[^ ;]+" "$LOG_GLOB" | sort -u

# 4) Trace one session end-to-end
rg -n "session_id=<thread>-<turn>" "$LOG_GLOB"

# 5) Focus on stuck/retry signals
rg -n "Issue stalled|scheduling retry|turn_timeout|turn_failed|Codex session failed|Codex session ended with error" "$LOG_GLOB"
```

## Investigation Flow

1. Locate the ticket slice:
    - Search by `issue_identifier=<KEY>`.
    - If noise is high, add `issue_id=<UUID>`.
2. Establish timeline:
    - Identify first `Codex session started ... session_id=...`.
    - Follow with `Codex session completed`, `ended with error`, or worker exit
      lines.
3. Classify the problem:
    - Stall loop: `Issue stalled ... restarting with backoff`.
    - App-server startup: `Codex session failed ...`.
    - Turn execution failure: `turn_failed`, `turn_cancelled`, `turn_timeout`, or
      `ended with error`.
    - Worker crash: `Agent task exited ... reason=...`.
4. Validate scope:
    - Check whether failures are isolated to one issue/session or repeating across
      multiple tickets.
5. Capture evidence:
    - Save key log lines with timestamps, `issue_identifier`, `issue_id`, and
      `session_id`.
    - Record probable root cause and the exact failing stage.

## Reading Codex Session Logs

In Symphony, Codex session diagnostics are emitted into `log/symphony.log` and
keyed by `session_id`. Read them as a lifecycle:

1. `Codex session started ... session_id=...`
2. Session stream/lifecycle events for the same `session_id`
3. Terminal event:
    - `Codex session completed ...`, or
    - `Codex session ended with error ...`, or
    - `Issue stalled ... restarting with backoff`

For one specific session investigation, keep the trace narrow:

1. Capture one `session_id` for the ticket.
2. Build a timestamped slice for only that session:
    - `rg -n "session_id=<thread>-<turn>" "$LOG_GLOB"`
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
  `apps/symphony/src/orchestrator.rs` and
  `apps/symphony/src/codex/app_server.rs`.
