# M004: Symphony Integration — UAT Report

**Date:** 2026-04-05
**Milestone:** M004 Symphony Integration
**Method:** agent-browser --cdp 9333 connected to Electron
**Environment:** Dev mode, apps/desktop, Symphony binary at apps/symphony/target/release/symphony

---

## Summary

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Desktop can start Symphony from GUI | ✅ PASS | [14-symphony-running-clean.png](14-symphony-running-clean.png) |
| 2 | Desktop can stop Symphony from GUI | ✅ PASS | [15-symphony-stopped.png](15-symphony-stopped.png) |
| 3 | Desktop can restart Symphony from GUI (new PID) | ✅ PASS | [16-symphony-restarted.png](16-symphony-restarted.png) — PID 7055→7972 |
| 4 | Runtime shows Ready/Stopped/Failed/Config Error states | ✅ PASS | [02](02-symphony-settings-idle.png), [03](03-symphony-start-attempt.png), [08](08-symphony-after-start-with-config.png), [10](10-symphony-started.png), [14](14-symphony-running-clean.png), [15](15-symphony-stopped.png) |
| 5 | Live dashboard shows connected/disconnected with counters | ✅ PASS | [14-symphony-running-clean.png](14-symphony-running-clean.png), [15-symphony-stopped.png](15-symphony-stopped.png) |
| 6 | Live worker rows update in real time | ✅ PASS | [20-dashboard-worker-active.png](20-dashboard-worker-active.png) — KAT-2357 row with In Progress state, model, tool activity, last activity time |
| 7 | Pending escalations visible and answerable from GUI | ✅ PASS | [26-escalation-dashboard.png](26-escalation-dashboard.png) — escalation with question text, response input, Submit button; [27-escalation-responded.png](27-escalation-responded.png) — 0 escalations after response |
| 13 | Status line shows live worker/escalation count | ✅ PASS | [21-live-worker-count-status.png](21-live-worker-count-status.png) — "Symphony: live · 1 worker · 0 escalations · 1 correlation miss" |
| 14 | Correlation miss reported when worker issue not on kanban | ✅ PASS | KAT-2357 has no milestone → not on board → "1 correlation miss" shown |
| 8 | Kanban cards show Symphony execution context | ✅ PASS | [24-kanban-worker-assigned.png](24-kanban-worker-assigned.png) — card shows "Worker KAT-2357 In Progress", "Execution: bash" live tool |
| 9 | Kanban shows "Symphony runtime disconnected" when Symphony is down | ✅ PASS | [01-initial-state.png](01-initial-state.png) — cards show disconnected state |
| 10 | Dashboard and kanban state stay aligned | ✅ PASS | Both surfaces show 1 worker, 0 escalations; card shows worker assignment matching dashboard row |
| 11 | Config errors show actionable messages | ✅ PASS | CONFIG_MISSING ([03](03-symphony-start-attempt.png)), WORKFLOW_PATH_MISSING ([07](07-symphony-after-start.png)), BINARY_NOT_FOUND ([08](08-symphony-after-start-with-config.png)), PROCESS_EXITED ([10](10-symphony-started.png)) |
| 12 | Top bar Symphony indicator reflects current state | ✅ PASS | Idle→Config Error→Failed→Ready→Stopped transitions all reflected |

---

## Detailed Observations

### ✅ Passing

**Lifecycle Management (S01)**
- Start button launches Symphony subprocess with correct binary path (resolved from KATA_SYMPHONY_BIN_PATH env var) and workflow file (from preferences)
- Process PID is displayed in the Settings → Symphony panel
- Stop terminates the process cleanly; status transitions to "Stopped" with "Not running"
- Restart kills and relaunches with a new PID (verified: 7055→7972)
- Button enable/disable state is correct: Start dimmed when running, Restart/Stop dimmed when stopped

**Error Handling**
- CONFIG_MISSING: When symphony.url not set in preferences — shows error with remediation steps
- WORKFLOW_PATH_MISSING: When workflow file not configured — shows specific error
- BINARY_NOT_FOUND: When symphony binary not on PATH and KATA_SYMPHONY_BIN_PATH not set — shows installation options
- PROCESS_EXITED: When Symphony crashes (e.g. port conflict, missing env vars) — shows exit code and stderr diagnostics available via IPC

**Dashboard Connection (S02)**
- Dashboard badge transitions: disconnected (red) → connected (green) when Symphony starts
- Counters (Workers, Queue, Completed, Escalations) render at 0 for idle Symphony
- "Connection issue" banner disappears when connected
- Dashboard Refresh button triggers a manual poll of /api/v1/state
- Dashboard correctly connects to externally-running Symphony when Refresh is clicked (tested with user's external instance)

**Kanban Integration (S03)**
- Cards show "No active Symphony execution" (cyan) when Symphony is connected but no workers assigned
- Cards show "Symphony runtime disconnected" when Symphony is not connected
- Transition is automatic when Symphony state changes
- All 4 M004 slices visible in Done column with correct KAT identifiers and task counts
- **Live worker assignment on card:** KAT-2357 card shows green "Worker KAT-2357" badge, "In Progress" state, and "Execution: bash" live tool indicator (screenshot 24)
- Zero correlation misses when the issue is milestone-scoped and has an active worker

**Top Bar Indicator**
- "Symphony: Idle" (default) → "Symphony: Config Error" (red) → "Symphony: Failed" (red) → "Symphony: Ready" (green) → "Symphony: Stopped" (grey)
- All transitions visible without opening Settings

**Live Worker Dashboard (S02, tested with real worker)**
- Created KAT-2357 (standalone project issue, no milestone) in Todo state
- Symphony picked it up within 30s and dispatched a worker
- Dashboard Refresh showed: Workers: 1, Queue: 0, Completed: 1, Escalations: 0
- Worker row rendered correctly: KAT-2357 title, "In Progress" state, "idle" tool, "openai-codex/gpt-5.3-codex" model, last activity timestamp
- Status line in the main view updated live: "Symphony: live · 1 worker · 0 escalations · 1 correlation miss"
- "1 correlation miss" correctly reports that the worker's issue (KAT-2357) has no kanban card — the board is milestone-scoped and KAT-2357 has no milestone

**Kanban correlation design note:**
The kanban board shows only milestone-scoped slices (issues with a projectMilestone). Symphony can work on any project issue. When a worker's issue isn't on the kanban, the status line reports it as a "correlation miss". This is correct behavior — the user sees the worker in the Dashboard (Settings → Symphony) even when it doesn't appear on the kanban. To see worker assignment on kanban cards, the issue must belong to the board's active milestone.

**Escalation Handling (S02, tested with real escalation)**
- Worker on KAT-2357 hit `ask_user_questions` and escalated to Desktop
- Dashboard showed: Escalations: 1, with the escalation question text and a response input field + "Submit response" button
- Kanban card updated: "1 escalation" red badge, "Execution: ask_user_questions" tool indicator
- User submitted response via the Dashboard UI
- After response: escalation count dropped to 0, worker resumed execution
- Full round-trip proven: worker escalates → Desktop shows question → operator responds → worker continues

### Setup Notes

- Symphony env vars (LINEAR_API_KEY, SLACK_WEBHOOK_URL, GH_TOKEN, etc.) must be in `apps/desktop/.env.development` since the Electron main process loads this file at startup
- `KATA_SYMPHONY_BIN_PATH` must point to the built Symphony binary
- `KATA_BIN_PATH` must point to the CLI loader for the agent bridge
- `symphony.url` and `symphony.workflow_path` must be set in `.kata/preferences.md`
- The managed process inherits the Electron process's environment, so all env vars pass through

---

## Test Environment

- **Platform:** macOS, Electron dev mode
- **Automation:** agent-browser v0.x via CDP port 9333
- **Auth state:** Anthropic + OpenAI providers configured
- **Symphony binary:** apps/symphony/target/release/symphony (Rust release build)
- **Workflow file:** apps/symphony/WORKFLOW-desktop.md
