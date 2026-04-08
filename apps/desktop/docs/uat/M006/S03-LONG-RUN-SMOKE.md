# S03 Long-Run Stability + Accessibility Smoke (M006)

## Purpose

This smoke checklist validates S03’s **operational** baseline claims for long-run stability and accessibility.

It is intentionally scoped to runtime confidence (instrumented automation + live runtime checks), not final packaged release-gate closure (S04).

## Preconditions

- `apps/desktop` branch includes S03 runtime-health threshold evaluator, IPC/preload stability snapshot wiring, and renderer breach affordances.
- Electron e2e fixtures are runnable in test mode.
- No secrets are printed in reports/logs.

## Smoke Checklist

### 1) Stability + renderer threshold contract tests

```bash
cd apps/desktop
npx vitest run \
  src/main/__tests__/runtime-health-aggregator.test.ts \
  src/main/__tests__/workflow-board-service.test.ts \
  src/main/__tests__/symphony-operator-service.test.ts \
  src/main/__tests__/mcp-service.test.ts \
  src/renderer/components/kanban/__tests__/KanbanPane.test.tsx \
  src/renderer/components/symphony/__tests__/SymphonyDashboard.test.tsx \
  src/renderer/components/settings/__tests__/McpServerPanel.test.tsx
```

**Pass condition:** All suites pass and include deterministic breach/recovery expectations.

---

### 2) Desktop type safety gate

```bash
cd apps/desktop
bun run typecheck
```

**Pass condition:** `tsc --noEmit` exits 0.

---

### 3) Long-run + accessibility Electron baseline

```bash
cd apps/desktop
npx playwright test \
  e2e/tests/m006-long-run-stability.e2e.ts \
  e2e/tests/m006-accessibility-baseline.e2e.ts
```

**Pass condition:**

- Long-run test proves reconnect-failure breach appears and clears on recovery.
- Accessibility baseline covers onboarding + chat + kanban + symphony + settings and fails on serious/critical violations.

---

### 4) Soak metrics artifact generation

```bash
cd apps/desktop
bun run qa:m006:soak -- --duration=180m --assert-thresholds --report docs/uat/M006/S03-SOAK-METRICS.json
```

**Pass condition:**

- Command exits 0.
- `docs/uat/M006/S03-SOAK-METRICS.json` is generated.
- Report shows a detected failure window and healthy recovery by final sample.

## Evidence Artifacts

- `docs/uat/M006/S03-SOAK-METRICS.json`
- `docs/uat/M006/S03-UAT-REPORT.md`
- `docs/uat/M006/S03-DOWNSTREAM-HANDOFF.md`

## Triage Notes (if failing)

Capture failures as:

- **Failure class/code:** stability breach code or a11y rule id
- **Metric/surface:** metric name + source surface
- **Observed vs threshold:** exact values from report/test output
- **Timestamp:** first failure sample or failing test run timestamp
- **Suggested recovery:** from breach payload or test guidance
- **Owner:** runtime/chat, workflow, symphony, settings/MCP, or test harness
