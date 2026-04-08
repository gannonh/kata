# S04 Beta Acceptance Script — Integrated Packaged Release Gate (M006)

## Purpose

Run one **packaged** end-to-end acceptance path that proves assembled M006 readiness across:

- Electron main/preload/renderer boundaries
- Kata CLI subprocess lifecycle
- Workflow board execution state
- Symphony runtime + operator dashboard
- MCP settings + config handling
- Cross-boundary failure and in-session recovery

This script is the canonical S04 walkthrough for live UAT and reviewer reruns.

## Evidence model

For every checkpoint, record an `acceptance-checkpoint` event with this shape:

```json
{
  "phase": "install|onboard|plan|execute|operate-symphony|operate-mcp|trigger-failure|recover|shutdown",
  "result": "pass|fail|skip",
  "evidenceRef": "docs/uat/M006/evidence/S04-XX-<name>.png",
  "timestamp": "2026-04-08T00:00:00.000Z",
  "failureReason": "<required when result=fail>"
}
```

Use these event rows in `docs/uat/M006/S04-BETA-UAT-REPORT.md` under **Checkpoint Results**.

## Preconditions

1. Build artifacts and packaged app are available.
2. Test profile is clean (fresh app profile or isolated user-data-dir).
3. S02 and S03 handoff evidence is available for consumption (not re-validation):
   - `docs/uat/M006/S02-DOWNSTREAM-HANDOFF.md`
   - `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md`
4. Redaction rule is active: no secrets/tokens/raw auth headers in screenshots, logs, or report text.

## Required commands (before/after walkthrough)

```bash
cd apps/desktop && bun run build && bun run dist:mac
cd apps/desktop && npx playwright test e2e/tests/m006-beta-acceptance.e2e.ts
cd apps/desktop && bun run typecheck
cd apps/desktop && bun run qa:m006:release-gate -- --assert-checkpoints --report docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json
```

## Sequenced checkpoints

> Run in order. Each checkpoint has objective pass/fail criteria and explicit evidence capture.

| # | Checkpoint | Actions | Pass criteria (objective) | Fail criteria | Required evidence |
| --- | --- | --- | --- | --- | --- |
| 01 | `install` | Install packaged `.dmg` on clean profile and launch app. | Packaged app launches to onboarding or ready shell without crash dialog; app identity is Kata Desktop. | Install fails, app fails to launch, or launch requires dev-mode-only steps. | `docs/uat/M006/evidence/S04-01-install.png` + `.dmg` path + build command output pointer |
| 02 | `onboard` | Complete onboarding (or verify seeded-auth dismissal path). | Chat input is available and first-run guidance is coherent (no contradictory auth/model/startup state). | Onboarding dead-end, contradictory guidance, or unusable chat shell. | `S04-02-onboard.png` + note of profile mode (`clean`/`seeded_auth`) |
| 03 | `plan` | Run planning action (`/kata plan` or equivalent scripted trigger). | Right pane switches to planning view and **artifact tabs are visible**. | Planning view does not appear, tabs missing, or pane shows contradictory state. | `S04-03-plan-tabs.png` + list of visible tab labels |
| 04 | `execute` | Return to workflow board and refresh execution state. | Kanban columns render and at least one workflow card/task is visible with coherent state labels. | Board missing columns/cards, stale/error state without recovery affordance, or contradictory state labels. | `S04-04-execute-kanban.png` + board scope shown in header |
| 05 | `operate-symphony` | Open Settings → Symphony, start/observe runtime and dashboard. | Runtime phase reaches expected active state and dashboard connection shows healthy/connected state. | Runtime cannot start/refresh, dashboard state is stale/disconnected without clear guidance, or status contradicts controls. | `S04-05-symphony.png` + runtime phase badge text |
| 06 | `operate-mcp` | Open Settings → MCP and inspect configured servers. | MCP panel is reachable and configured servers are listed with status affordances. | MCP panel unavailable, server list missing despite config, or errors without guidance. | `S04-06-mcp.png` + config provenance badge text |
| 07 | `trigger-failure` | Trigger representative cross-boundary failure (minimum: chat subprocess crash; optional: Symphony disconnect or MCP malformed config). | Failure is **visibly surfaced** with canonical reliability language (class/action/code) and recovery control available. | Silent failure, unclear/no recovery action, or opaque raw backend error leakage. | `S04-07-failure-visible.png` + failure boundary note (subprocess/network/config/renderer) |
| 08 | `recover` | Execute visible recovery action(s) without app restart. | Surface returns to healthy, user can continue in same session, and last-known-good state remains visible during degradation window. | Recovery requires app restart, session context is lost, or state becomes contradictory after recovery. | `S04-08-recovered.png` + before/after state notes |
| 09 | `shutdown` | Stop managed runtime (if running) and close app cleanly. | Runtime transitions to stopped/idle cleanly and app exits without crash artifacts. | Runtime cannot stop, exit hangs indefinitely, or crash on shutdown. | `S04-09-shutdown.png` + shutdown log pointer |

## Checkpoint completion rule

A checkpoint is **pass** only when all objective pass conditions are met and evidence is captured.
If any condition fails or evidence is missing, mark **fail** and include `failureReason`.
Use **skip** only when a checkpoint is truly not applicable; include rationale.

## What S04 consumes vs proves fresh

### Consumed (do not re-prove in S04)

- S02 first-run contract + guidance guarantees (`S02-DOWNSTREAM-HANDOFF.md`, `S02-UAT-REPORT.md`)
- S03 soak/accessibility baseline (`S03-DOWNSTREAM-HANDOFF.md`, `S03-UAT-REPORT.md`, `S03-SOAK-METRICS.json`)
- S01 reliability taxonomy + representative recovery classes (`S01-DOWNSTREAM-HANDOFF.md`, `S01-UAT-REPORT.md`)

### Proved fresh in S04

- Final packaged integrated path across all runtime boundaries
- End-to-end checkpoint evidence in one assembled walkthrough
- Release-gate recommendation readiness (`go` / `no-go`) based on complete checkpoint + blocker truth

## Output artifacts

- `docs/uat/M006/S04-BETA-UAT-REPORT.md` (checkpoint evidence log)
- `docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json` (machine-readable summary)
- `docs/uat/M006/M006-ACCEPTANCE-REPORT.md` (milestone-level decision report)
