# S04 End-to-End Desktop Symphony Smoke (M004)

## Goal

Validate the full assembled M004 operator path in one real Electron session:

1. Desktop manages Symphony runtime lifecycle.
2. Dashboard shows live worker/escalation state.
3. Operator responds to a pending escalation in GUI.
4. Kanban reflects the same work item convergence.
5. Truthful stale/disconnected behavior is visible and recoverable.

---

## Preconditions

- Desktop is built from this branch.
- Symphony is configured for the workspace (`symphony.url`, `symphony.workflow_path`).
- A test workflow can produce at least one pending escalation.
- No secrets are captured in screenshots/log excerpts.

---

## Automated milestone proof (deterministic fixture path)

```bash
cd apps/desktop
bun run build
npx playwright test e2e/tests/symphony-end-to-end.e2e.ts
```

Targeted subsets:

```bash
cd apps/desktop
npx playwright test e2e/tests/symphony-end-to-end.e2e.ts --grep "scenario control"
npx playwright test e2e/tests/symphony-end-to-end.e2e.ts --grep "healthy assembled flow"
npx playwright test e2e/tests/symphony-end-to-end.e2e.ts --grep "failure-path truthfulness"
```

---

## Live acceptance walkthrough (real runtime)

1. Launch Kata Desktop.
2. Open **Settings → Symphony**.
3. Click **Start** in runtime panel.
4. Confirm runtime reaches **Ready** and app-shell badge reports `Symphony: Ready`.
5. Confirm dashboard connection is `connected` and worker table has live activity.
6. Capture `workers`, `queue`, `completed`, and `escalations` summary values.
7. Wait for or trigger a real escalation.
8. Submit escalation response from GUI.
9. Confirm success banner and escalation list update.
10. Close settings and open kanban surface.
11. Confirm the **same issue identifier** seen in dashboard is visible on the board card/task metadata.
12. Confirm board status line shows live Symphony freshness and counts.
13. Trigger disconnect or stale condition (stop runtime or disrupt connectivity).
14. Confirm dashboard/board show truthful `stale` or `disconnected` states while workflow cards remain visible.
15. Restore runtime/connection.
16. Confirm dashboard and board return to aligned live state.
17. Stop Symphony from Desktop and confirm truthful stopped/disconnected state.

---

## Packaged / packaged-like smoke

1. Build packaged (or packaged-like) Desktop output.
2. Launch packaged app.
3. Repeat the same assembled flow from **Live acceptance walkthrough**.
4. Verify Start/Respond/Converge/Disconnect/Recover/Stop behavior matches dev-mode expectations.
5. Record any parity differences between dev and packaged runs.

---

## Evidence requirements

Attach references in `S04-UAT-REPORT.md`:

- Runtime ready state screenshot
- Dashboard connected + active work screenshot
- Pending escalation screenshot
- Post-response success screenshot
- Kanban convergence screenshot for same work item
- Disconnected/stale truthfulness screenshot
- Recovery screenshot
- Runtime stopped/disconnected final screenshot
- Packaged run equivalents (or explicit fail reason)

Allowed evidence fields: safe identifiers, timestamps, worker labels, UI state.
Never include secrets, auth headers, or raw escalation payload bodies.
