# S03 Kanban Convergence Smoke (M004)

## Goal

Verify the same workflow item can be traced between Symphony dashboard state and kanban card metadata in Kata Desktop, including stale and disconnected degradation.

## Preconditions

- Kata Desktop built and running.
- Workspace configured for a live workflow board.
- Symphony runtime reachable and dashboard populated.

## Live Smoke Checklist

1. Open **Settings → Symphony** and start Symphony from Desktop.
2. Confirm dashboard shows at least one active worker row and (optionally) pending escalations.
3. Switch to the kanban pane and locate the same slice/task by identifier.
4. Verify card-level metadata convergence:
   - Worker assignment appears on the card/task.
   - Execution state/tool hint is visible.
   - Pending escalation count is visible when applicable.
5. Confirm board header convergence status includes Symphony freshness summary and worker/escalation counts.
6. Trigger or wait for stale state (pause updates / stale snapshot path) and verify:
   - Header shows stale indicator.
   - Card remains in its workflow column.
   - Stale warning text appears without hiding workflow data.
7. Trigger runtime disconnect (stop Symphony) and verify:
   - Header shows disconnected indicator.
   - Cards still render workflow placement.
   - Card-level hint states runtime disconnected (no false active certainty).
8. Restart Symphony and refresh board; confirm convergence returns to live state.

## Pass Criteria

- The same slice/task can be correlated between dashboard and kanban by identifier.
- Assignment/execution/escalation metadata is visible on cards/tasks without duplicating full dashboard payload.
- Stale and disconnected states are explicit and truthful while preserving readable workflow data.
