# M006 Acceptance Report — Integrated Beta Release Decision

Milestone: **[M006] Integrated Beta**
Date (UTC): **2026-04-08**
Issue: **KAT-2402**
Project: **Kata Desktop**

## Decision summary

Beta Recommendation: go

Rationale: all S04 checkpoints passed in this run, deterministic integrated acceptance automation passed, packaged install/launch/shutdown smoke passed, and consumed S02/S03 upstream evidence remains healthy with no unresolved P0/P1 blockers.

## Success criteria status (M006)

| Criterion | Status | Evidence |
| --- | --- | --- |
| SC-01 — Packaged install + onboarding reaches usable chat session | PASS | `docs/uat/M006/S04-BETA-UAT-REPORT.md` (`install`, `onboard`), `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md` |
| SC-02 — Integrated session proves plan → execute → Symphony → MCP coherently | PASS | `docs/uat/M006/S04-BETA-UAT-REPORT.md` (`plan`, `execute`, `operate-symphony`, `operate-mcp`), `e2e/tests/m006-beta-acceptance.e2e.ts` |
| SC-03 — Representative failures visibly degrade and recover without restart/session loss | PASS | `docs/uat/M006/S04-BETA-UAT-REPORT.md` (`trigger-failure`, `recover`), `docs/uat/M006/S01-UAT-REPORT.md` |
| SC-04 — Long-run stability/accessibility baseline stays release-ready | PASS | `docs/uat/M006/S03-UAT-REPORT.md`, `docs/uat/M006/S03-SOAK-METRICS.json` (`final.status=healthy`) |
| SC-05 — Release evidence complete with objective gate output | PASS | `docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json`, `docs/uat/M006/S04-RELEASE-GATE-CHECKLIST.md`, this report |

## S01–S04 evidence index

### S01 (reliability taxonomy + recovery contract)

- `docs/uat/M006/S01-UAT-REPORT.md`
- `docs/uat/M006/S01-DOWNSTREAM-HANDOFF.md`

### S02 (first-run/onboarding readiness)

- `docs/uat/M006/S02-UAT-REPORT.md`
- `docs/uat/M006/S02-DOWNSTREAM-HANDOFF.md`

### S03 (stability/perf/a11y baseline)

- `docs/uat/M006/S03-UAT-REPORT.md`
- `docs/uat/M006/S03-SOAK-METRICS.json`
- `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md`

### S04 (final assembly release gate)

- `docs/uat/M006/S04-BETA-ACCEPTANCE-SCRIPT.md`
- `docs/uat/M006/S04-BETA-UAT-REPORT.md`
- `docs/uat/M006/S04-RELEASE-GATE-CHECKLIST.md`
- `docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json`
- `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md`

## Blocker triage

- P0: none
- P1: none

## Release-gate integrity checks

- All 9 S04 checkpoints recorded with objective pass/fail outcomes
- Machine-readable release summary generated from checkpoint + criterion assertions
- No secrets/tokens included in committed acceptance artifacts

## Reviewer rerun commands

```bash
cd apps/desktop && bun run build && bun run dist:mac
cd apps/desktop && npx playwright test e2e/tests/m006-beta-acceptance.e2e.ts
cd apps/desktop && bun run typecheck
cd apps/desktop && bun run qa:m006:release-gate -- --assert-checkpoints --report docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json
```
