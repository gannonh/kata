# Phase 1: Minimum Viable Loop

**Date:** 2026-03-19
**Status:** Approved
**Branch:** `elixir-feature-parity`

## Goal

Get Symphony's autonomous work loop running end-to-end: orchestrator picks up a ticket from Linear → clones repo → agent does the work → agent opens PR → agent moves issue to Human Review → human approves by moving to Merging → agent lands PR → issue moves to Done → next ticket dispatched.

## Linear State Machine

```
Todo → In Progress → Human Review → Merging → Done
                   ↗
       Rework ────┘
```

- **Todo** (unstarted) — queued for dispatch
- **In Progress** (started) — orchestrator moved it here on dispatch; agent is working
- **Human Review** (started) — agent finished, PR attached, waiting on human. NOT in active_states — Symphony stops working.
- **Merging** (started) — human approved. Symphony re-dispatches. Agent runs `land` skill to merge PR.
- **Rework** (started) — human rejected. Symphony re-dispatches. Agent starts fresh.
- **Done** (completed) — terminal. Loop stops.

`active_states` in WORKFLOW.md:
```yaml
active_states:
  - Todo
  - In Progress
  - Merging
  - Rework
```

## Change 1: Wire Real `linear_graphql` Executor

**Problem:** `run_worker_task` in `orchestrator.rs` has a dummy GraphQL executor that always errors. The agent cannot talk to Linear.

**Fix:**
- Add `TrackerConfig` parameter to `run_worker_task`
- Create a `LinearClient` from it inside the worker task
- Pass `client.graphql_raw()` as the executor closure
- `spawn_workers_for_dispatched` passes `self.config.tracker.clone()` to each spawned task

**Files:** `src/orchestrator.rs`
**Impact:** ~15 lines changed. No new modules or dependencies.

## Change 2: Orchestrator "In Progress" Writeback

**Problem:** The orchestrator only reads from Linear. When it dispatches an issue, the issue stays in "Todo" in Linear.

**Fix:**
- Add to `LinearAdapter` (in `src/linear/adapter.rs`):
  - `resolve_state_id(issue_id, state_name) -> Result<String>` — GraphQL query to look up a workflow state ID by name via the issue's team
  - `update_issue_state(issue_id, state_name) -> Result<()>` — resolves state ID then calls `issueUpdate` mutation
  - These match the exact GraphQL queries from the Elixir adapter
- Add `update_issue_state` to `OrchestratorPort` trait
- In `spawn_workers_for_dispatched`, before spawning each worker task, call `port.update_issue_state(issue_id, "In Progress")`
- Log and continue on failure — a failed state update must not block dispatch

**Files:** `src/linear/adapter.rs`, `src/orchestrator.rs`, `src/main.rs`
**Impact:** ~70 lines total.

## Change 3: WORKFLOW.md Prompt Port

**Start from:** Copy the Elixir WORKFLOW.md (`/Volumes/EVO/kata/openai-symphony/elixir/WORKFLOW.md`) verbatim.

**Then make these changes:**

1. `tracker.project_slug` → `89d4761fddf0` (Symphony project)
2. `workspace.root` → `~/symphony-workspaces`
3. `hooks.after_create` → clone from local repo on `elixir-feature-parity` branch (remove `mise` and Elixir dep setup)
4. `hooks.before_remove` → remove `cd elixir && mise exec -- mix workspace.before_remove`
5. `codex.command` → keep as-is from Elixir (`codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh --model gpt-5.3-codex app-server`)
6. `active_states` → `[Todo, In Progress, Merging, Rework]`
7. In prompt body, replace repository context with `apps/symphony/` within kata-mono monorepo
8. Remove `mise` references from prompt body (we use `cargo`, not `mix`)
9. Skill path references stay the same (`.codex/skills/`)
10. Since orchestrator moves to "In Progress" on dispatch, the agent's Step 0 verifies it's already In Progress rather than doing the transition itself

**Everything else stays exactly as Elixir wrote it:** full status map, workpad protocol, Steps 0-4, PR feedback sweep, blocked-access escape hatch, completion bar, guardrails, workpad template, continuation retry prompt.

## Change 4: Port Codex Skills

**Start from:** Copy all 5 skill directories from `/Volumes/EVO/kata/openai-symphony/.codex/skills/` to `/.codex/skills/` at the repo root:

- `commit/SKILL.md`
- `push/SKILL.md`
- `pull/SKILL.md`
- `land/SKILL.md`
- `linear/SKILL.md`

**Changes:** Read each skill file and adapt any Elixir-specific references (e.g. `mix` commands, Elixir paths). These are agent instruction documents, not code — they should be mostly repo-agnostic.

**Files:** 5 new markdown files in `/.codex/skills/`

## Change 5: Linear Custom States

**Done by user.** Three custom workflow states added to the KAT team:
- Human Review (started)
- Merging (started)
- Rework (started)

Plus existing: Agent Review (started) — used by other workflows, not by Symphony.

## What This Does NOT Include

- Real-time event streaming from worker to orchestrator (dashboard is blind during execution)
- Live token counter during turns
- TUI terminal dashboard
- Video/media upload to Linear comments
- `debug` skill
- Persistent retry queue across restarts
- Configurable workspace repo bootstrap (KAT-800 — stays as a hook for now)

These are Phase 2/3 items. After Phase 1 works, they become Linear tickets for Symphony to build itself.

## Verification

1. Start Symphony pointed at the Symphony project
2. Create a test ticket in Todo with clear acceptance criteria
3. Observe: orchestrator picks it up, moves to In Progress, agent clones repo, does work, opens PR, moves to Human Review
4. Move issue to Merging in Linear
5. Observe: agent lands PR, moves to Done
6. Confirm: next Todo ticket gets dispatched

## Architecture Notes

**Two actors:**
- **Orchestrator** — long-running state machine. Polls Linear, dispatches workers, reacts to results. One write: moves issue to "In Progress" on dispatch.
- **Worker agents** — short-lived Codex sessions. Get a workspace + prompt. Write back to Linear via `linear_graphql` tool. Handle all state transitions after In Progress.

**Continuation loop:** Worker completes turn → orchestrator schedules continuation retry → re-fetches issue from Linear → if still active → dispatch again (same workspace, fresh session) → if terminal → stop, slot opens, next ticket.
