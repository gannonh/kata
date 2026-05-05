# S04 Beta UAT Report — Integrated Packaged Acceptance Gate (M006)

- Slice: **KAT-2402 / S04**
- Child task executed in this session: **KAT-2417 (T04)**
- Date (UTC): **2026-04-08**
- Tester: **Kata orchestration agent (unattended deterministic gate run)**
- Runtime mode mix:
  - **Packaged app (.dmg) on clean profile** for install/launch/shutdown proof
  - **Deterministic Electron integrated suite** for assembled plan/execute/operate/recovery checkpoints

## Scope

This run executes the canonical `S04-BETA-ACCEPTANCE-SCRIPT.md` checkpoint sequence and records objective pass/fail evidence for each phase:

1. install
2. onboard
3. plan
4. execute
5. operate-symphony
6. operate-mcp
7. trigger-failure
8. recover
9. shutdown

## Validation commands executed

```bash
cd apps/desktop && bun run build && bun run dist:mac
cd apps/desktop && npx playwright test e2e/tests/m006-beta-acceptance.e2e.ts
cd apps/desktop && bun run typecheck
```

Transcript source: `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md`

## Checkpoint Results

| Checkpoint | Result | Evidence | Timestamp | Failure reason |
| --- | --- | --- | --- | --- |
| install | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#1-build--dmg-packaging` + `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#2-packaged-installlaunchshutdown-smoke-clean-profile` | 2026-04-08T20:39:14Z | - |
| onboard | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (happy-path assertion: chat input visible with seeded auth) | 2026-04-08T20:40:11Z | - |
| plan | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (planning view + `[S04]`/`[S03]` tabs asserted) | 2026-04-08T20:40:22Z | - |
| execute | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (kanban pane + board columns asserted) | 2026-04-08T20:40:29Z | - |
| operate-symphony | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (runtime phase badge Ready + dashboard connected asserted) | 2026-04-08T20:40:36Z | - |
| operate-mcp | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (MCP panel visible + fixture server row asserted) | 2026-04-08T20:40:42Z | - |
| trigger-failure | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (chat runtime process failure banner + symphony disconnect degradation asserted) | 2026-04-08T20:40:55Z | - |
| recover | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (recovery action clears degraded state; chat + kanban continue without restart) | 2026-04-08T20:41:02Z | - |
| shutdown | pass | `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#2-packaged-installlaunchshutdown-smoke-clean-profile` + `docs/uat/M006/evidence/S04-RUN-TRANSCRIPT.md#3-integrated-m006-acceptance-automation` (symphony stop and packaged app quit) | 2026-04-08T20:41:09Z | - |

## Consumed upstream evidence (not re-proven)

- S02 handoff + first-run evidence:
  - `docs/uat/M006/S02-DOWNSTREAM-HANDOFF.md`
  - `docs/uat/M006/S02-UAT-REPORT.md`
- S03 handoff + stability/a11y evidence:
  - `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md`
  - `docs/uat/M006/S03-UAT-REPORT.md`
  - `docs/uat/M006/S03-SOAK-METRICS.json`
- S01 reliability taxonomy + recovery contract:
  - `docs/uat/M006/S01-DOWNSTREAM-HANDOFF.md`
  - `docs/uat/M006/S01-UAT-REPORT.md`

## Notes

- This run preserved redaction constraints (no API keys/tokens/raw auth payloads captured in S04 artifacts).
- No contradictory state was observed between chat/planning/kanban/symphony/mcp surfaces during the integrated flow.
