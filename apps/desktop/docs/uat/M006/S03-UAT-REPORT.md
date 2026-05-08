# S03 UAT Report — Long-Run Stability, Performance, Accessibility (M006)

## Scope

Operational baseline evidence for S03:

- Thresholded long-run stability contract is active and deterministic.
- Renderer surfaces expose degradations/breaches with recovery guidance.
- Accessibility baseline covers onboarding, chat, kanban, Symphony dashboard, and MCP/settings.
- Soak report output is machine-readable and release-triage ready.

## Environment

- Workspace: `/Volumes/EVO/symphony-workspaces/KAT-2401`
- App: `apps/desktop`
- Branch: `sym/KAT-2401`
- Date: 2026-04-08

## Executed Validation

### 1) Stability + renderer suites

Command:

```bash
cd apps/desktop && npx vitest run src/main/__tests__/runtime-health-aggregator.test.ts src/main/__tests__/workflow-board-service.test.ts src/main/__tests__/symphony-operator-service.test.ts src/main/__tests__/mcp-service.test.ts src/renderer/components/kanban/__tests__/KanbanPane.test.tsx src/renderer/components/symphony/__tests__/SymphonyDashboard.test.tsx src/renderer/components/settings/__tests__/McpServerPanel.test.tsx
```

Result: ✅ **PASS**

- 7 files passed
- 130 tests passed
- Confirms deterministic threshold mapping + UI breach visibility assertions.

### 2) Typecheck

Command:

```bash
cd apps/desktop && bun run typecheck
```

Result: ✅ **PASS**

### 3) Long-run + accessibility Electron e2e

Command:

```bash
cd apps/desktop && npx playwright test e2e/tests/m006-long-run-stability.e2e.ts e2e/tests/m006-accessibility-baseline.e2e.ts
```

Result: ✅ **PASS**

- 3/3 tests passed
- Long-run recovery path validated (breach appears during failure and clears after recovery).
- Accessibility baseline severity gate passed for onboarding + execution surfaces.

### 4) Soak report generation

Command:

```bash
cd apps/desktop && bun run qa:m006:soak -- --duration=180m --assert-thresholds --report docs/uat/M006/S03-SOAK-METRICS.json
```

Result: ✅ **PASS**

- Report written: `docs/uat/M006/S03-SOAK-METRICS.json`
- Final status: `healthy`
- Final breaches: `0`

## Soak Metrics Summary (`S03-SOAK-METRICS.json`)

- Threshold version: `m006-r020-v1`
- Simulated duration: `180m`
- Samples: `36` (5-minute spacing)
- Failure window detected: `true`
- Recovered by end: `true`
- Sample distribution:
  - healthy: `31`
  - degraded: `0`
  - breached: `5`

Final metrics:

- `eventLoopLagMs`: 21
- `heapGrowthMb`: 103
- `staleAgeMs`: 18,000
- `reconnectSuccessRate`: 0.99
- `recoveryLatencyMs`: 3,000
- `a11yViolationCounts`: serious=0, critical=0

## Accessibility Baseline Result

Severity gate policy (as implemented by `m006-accessibility-baseline.e2e.ts`):

- **Block merge/release evidence** on any `critical` or `serious` violation.
- `moderate` findings are informational and must still be tracked.

Run outcome: ✅ No blocking (`critical`/`serious`) baseline violations detected.

## Blocker Triage

No release-blocking issues found in this S03 run.

| Severity | Finding | Owner | Release implication |
| --- | --- | --- | --- |
| None | No open blocking findings from S03 automation | N/A | None for S03 operational baseline |

## Decision

✅ **S03 operational baseline confidence achieved**.

This report is suitable as S03 evidence input for S04 packaged integrated release gating.
