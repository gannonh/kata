# M003: Workflow Kanban — UAT Report

**Date:** 2026-04-04
**Milestone:** M003 Workflow Kanban
**Slice:** S04 End-to-End Kanban Integration Proof
**Method:** Deterministic Electron Playwright matrix + live workspace smoke checklist

---

## Acceptance Matrix

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Planning → execution handoff uses real main→preload→renderer path and pane reasoning is visible | ✅ PASS (deterministic) | `e2e/tests/workflow-context-switching.e2e.ts`, `e2e/tests/workflow-kanban-integration.e2e.ts` |
| 2 | Manual override persists across reload and can return to auto mode | ✅ PASS (deterministic) | `e2e/tests/workflow-context-switching.e2e.ts`, `e2e/tests/workflow-kanban-integration.e2e.ts` |
| 3 | Linear board renders with backend/freshness provenance and refresh support | ✅ PASS (deterministic seam) | `e2e/tests/workflow-kanban.e2e.ts` |
| 4 | GitHub label mode renders on the same renderer path | ✅ PASS (deterministic seam) | `e2e/tests/workflow-kanban-github.e2e.ts`, `e2e/tests/workflow-kanban-integration.e2e.ts` |
| 5 | GitHub Projects v2 mode renders on the same renderer path | ✅ PASS (deterministic seam) | `e2e/tests/workflow-kanban-github.e2e.ts`, `e2e/tests/workflow-kanban-integration.e2e.ts` |
| 6 | Stale/error state remains truthful and refresh recovery is visible | ✅ PASS (deterministic seam) | `e2e/tests/workflow-context-switching.e2e.ts`, `e2e/tests/workflow-kanban-integration.e2e.ts` |
| 7 | Live Linear smoke captured with screenshot evidence | ⚠️ BLOCKED | `02-linear-runtime-board.png` (pending live run) |
| 8 | Live GitHub smoke captured for labels + projects_v2 with screenshot evidence | ⚠️ BLOCKED | `03-github-labels-runtime-board.png`, `04-github-projects-runtime-board.png` (pending live run) |

---

## Deterministic Runtime Proof (completed)

The S04 deterministic matrix now exercises the assembled runtime path through Electron main process, preload IPC bridge, and renderer:

- `workflow-kanban.e2e.ts` — canonical board rendering + task expansion
- `workflow-kanban-github.e2e.ts` — GitHub labels/projects_v2 parity via WORKFLOW.md-backed runtime config
- `workflow-context-switching.e2e.ts` — planning/execution context resolution, override persistence, stale/error surfaces
- `workflow-kanban-integration.e2e.ts` — assembled cross-boundary proof (handoff + stale recovery + backend mode switching)

These tests validate that a single renderer path presents Linear and GitHub boards with truthful provenance (`backend`, `mode`, `repo`, freshness status).

## Live Proof Status (truthful)

Live screenshots are **not recorded in this unattended session**. Final milestone sign-off still requires running the checklist in `README.md` against configured real Linear and GitHub workspaces and attaching:

- `01-planning-to-kanban-handoff.png`
- `02-linear-runtime-board.png`
- `03-github-labels-runtime-board.png`
- `04-github-projects-runtime-board.png`
- `05-refresh-retry-stale.png`

Until those images exist, live acceptance is intentionally marked **BLOCKED** instead of pass.
