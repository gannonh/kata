# M003 UAT Evidence Pack

This folder contains acceptance evidence for **M003: Workflow Kanban** final-assembly proof (S04).

## Artifacts

- `M003-UAT.md` — acceptance matrix with deterministic + live checks
- `01-planning-to-kanban-handoff.png` — planning→execution handoff view
- `02-linear-runtime-board.png` — live Linear board proof (backend/mode/freshness visible)
- `03-github-labels-runtime-board.png` — live GitHub label-mode proof
- `04-github-projects-runtime-board.png` — live GitHub Projects v2 proof
- `05-refresh-retry-stale.png` — stale/error + refresh recovery proof

> Screenshot filenames are fixed so future runs can overwrite evidence deterministically.

## Runbook (live)

1. Launch Desktop against a real Linear workspace (no `KATA_TEST_MODE`).
2. Verify planning→execution handoff and capture `01-planning-to-kanban-handoff.png`.
3. Capture live Linear board with provenance badges as `02-linear-runtime-board.png`.
4. Switch workspace config to GitHub labels mode and capture `03-github-labels-runtime-board.png`.
5. Switch to GitHub Projects v2 mode and capture `04-github-projects-runtime-board.png`.
6. Trigger a stale/error state and capture post-refresh recovery as `05-refresh-retry-stale.png`.
