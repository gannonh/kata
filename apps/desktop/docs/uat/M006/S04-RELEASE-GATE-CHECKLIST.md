# S04 Release Gate Checklist — M006 Integrated Beta

## Scope

This checklist maps each **M006 success criterion** (from `M006-ROADMAP`) to concrete evidence sources and ownership boundaries.

- **Consumed evidence** (S01/S02/S03) is referenced, not re-proven.
- **Fresh S04 evidence** comes from packaged integrated walkthrough + deterministic M006 acceptance suite.

## Evidence source map

| M006 Success Criterion | Primary evidence | Consumed inputs | Fresh proof in S04 | Pass rule |
| --- | --- | --- | --- | --- |
| 1) First-time user can install packaged app and reach usable chat session without hidden setup | `docs/uat/M006/S04-BETA-UAT-REPORT.md` checkpoints `install`, `onboard` | `docs/uat/M006/S02-DOWNSTREAM-HANDOFF.md`, `docs/uat/M006/S02-UAT-REPORT.md` | Packaged `.dmg` run on clean profile with objective checkpoint results | Both checkpoints pass with screenshot + runtime evidence |
| 2) One session proves planning + execution + Symphony + MCP with coherent UI | `docs/uat/M006/S04-BETA-UAT-REPORT.md` checkpoints `plan`, `execute`, `operate-symphony`, `operate-mcp` + `e2e/tests/m006-beta-acceptance.e2e.ts` happy path | `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md` (coherence expectations), existing M001–M005 surface contracts | Deterministic assembled happy-path e2e + live packaged walkthrough | All four checkpoints pass and no contradictory pane/runtime state appears |
| 3) Representative failures recover without trust loss or session loss | `docs/uat/M006/S04-BETA-UAT-REPORT.md` checkpoints `trigger-failure`, `recover` + `e2e/tests/m006-beta-acceptance.e2e.ts` recovery path | `docs/uat/M006/S01-DOWNSTREAM-HANDOFF.md`, `docs/uat/M006/S01-UAT-REPORT.md` (taxonomy + recovery contract) | Live packaged failure injection + deterministic recovery assertions | Failure is visible with canonical action/code and recovery succeeds without app restart |
| 4) Long-run stability/perf/a11y baseline has no showstopper regressions | `docs/uat/M006/S03-SOAK-METRICS.json` + `docs/uat/M006/S03-UAT-REPORT.md` | `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md` | S04 confirms these artifacts remain valid and uncontradicted by packaged run | `S03-SOAK-METRICS.json.final.status == healthy` and no new blocking contradiction in S04 |
| 5) Beta release evidence is complete in-repo with no unresolved P0/P1 blocker for GO | `docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json`, `docs/uat/M006/M006-ACCEPTANCE-REPORT.md` | S01/S02/S03 reports + handoffs | S04 assembles final release decision package | Every criterion has evidence; blocker triage explicit; recommendation is objective (`go` only with zero unresolved P0/P1) |

## S02/S03 handoff consumption contract

S04 explicitly consumes (and must link, not duplicate):

- `docs/uat/M006/S02-DOWNSTREAM-HANDOFF.md` — first-run contract assumptions + already-proven first-run coverage
- `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md` — long-run threshold/a11y baseline assumptions + triage payload contract

## Gate decision policy

- **Go** only when:
  1. All 9 S04 checkpoints are `pass`
  2. All 5 M006 success criteria are `pass`
  3. No unresolved P0/P1 blockers remain
- **No-go** when any checkpoint/criterion fails, evidence is missing, or unresolved P0/P1 blockers remain.

## Required machine check

```bash
cd apps/desktop && bun run qa:m006:release-gate -- --assert-checkpoints --report docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json
```

## Traceability index

- Roadmap source: `Linear Document: M006-ROADMAP`
- S01 evidence: `docs/uat/M006/S01-UAT-REPORT.md`
- S02 evidence: `docs/uat/M006/S02-UAT-REPORT.md`
- S03 evidence: `docs/uat/M006/S03-UAT-REPORT.md`, `docs/uat/M006/S03-SOAK-METRICS.json`
- S04 evidence: `docs/uat/M006/S04-BETA-UAT-REPORT.md`, `docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json`, `docs/uat/M006/M006-ACCEPTANCE-REPORT.md`
