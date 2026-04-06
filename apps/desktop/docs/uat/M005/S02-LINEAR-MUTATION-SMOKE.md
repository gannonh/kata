# M005 / S02 — Linear Workflow Mutation Smoke

## Scope

Validate **Linear-backed workflow mutation only** from the Desktop board:

- Move a slice card between workflow columns.
- Trigger a move failure and verify explicit rollback visibility.
- Create a child task from a slice card.
- Edit task title/description/state from the board with on-demand detail load.

> Out of scope: GitHub write parity, MCP management, full M005 milestone assembly.

## Preconditions

1. Kata Desktop built and running.
2. Workspace is Linear-backed (`workflow.mode: linear`) with a visible slice card and child tasks.
3. Linear API credentials are configured for Desktop runtime.
4. Symphony state can be stale/disconnected without blocking Linear mutation checks (board remains visible).

## Smoke Steps

1. **Slice move success**
   - On a visible slice card, use **Move slice** and select a different column.
   - Confirm card-level message shows pending → success.
   - Confirm card appears in the target column.

2. **Slice move rollback failure**
   - Trigger a known failing move path (or simulate backend rejection).
   - Confirm card-level message shows an explicit failure.
   - Confirm slice remains in its prior column (rollback visible, no ambiguous state).

3. **Create child task from slice card**
   - Click **Add task** on the slice card.
   - Submit title (+ optional description).
   - Confirm dialog reports success and closes.
   - Expand task list and confirm new task is visible.
   - Refresh board and confirm task still exists (no ghost rows).

4. **Edit task from task row**
   - Click **Edit task** on an existing task row.
   - Confirm dialog loads current detail before save (title/state prefilled).
   - Update title/description/state and save.
   - Confirm row reflects new values after save + refresh.

5. **Validation/error visibility**
   - Submit create/edit with invalid input (empty title).
   - Confirm validation remains in dialog and no board mutation occurs.
   - Trigger backend rejection for create/edit and confirm inline dialog error remains visible.

## Pass/Fail Criteria

- **PASS** when all mutation paths show explicit pending/success/failure states, rollback is visible on failure, and post-write refresh reconciles with persisted Linear truth.
- **FAIL** if any mutation silently fails, leaves ghost data, or hides rollback/error state.

## Evidence to Capture

- Screenshot: successful slice move status + target column.
- Screenshot: failed move rollback message.
- Screenshot: create-task dialog + resulting task row.
- Screenshot: edit-task dialog + updated row after save.
- Note any divergence between optimistic UI and refreshed Linear state.
