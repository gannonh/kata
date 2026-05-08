# S03 → S04 Downstream Handoff (M006)

## Intent

Provide S04 with explicit inputs from S03 and a clean boundary between:

1. what is already proven in S03, and
2. what S04 must still prove for final packaged beta gate closure.

## S03 Evidence Bundle

- Soak metrics report: `docs/uat/M006/S03-SOAK-METRICS.json`
- Smoke procedure: `docs/uat/M006/S03-LONG-RUN-SMOKE.md`
- UAT execution report: `docs/uat/M006/S03-UAT-REPORT.md`

## Proven in S03 (Operational Baseline)

- Canonical threshold contract exists and is machine-checkable:
  - `eventLoopLagMs`
  - `heapGrowthMb`
  - `staleAgeMs`
  - `reconnectSuccessRate`
  - `recoveryLatencyMs`
  - `a11yViolationCounts`
- Threshold evaluator emits stable breach metadata (class/code/action/timestamp/suggested recovery).
- Main-process services (chat runtime, workflow board, Symphony, MCP) emit cross-surface metrics into one aggregated snapshot.
- IPC/preload exposes typed stability snapshot + subscription.
- Renderer surfaces show degraded/breached state with metric-specific guidance and last-known-good context.
- Deterministic automation exists for:
  - long-run failure/recovery assertions (`m006-long-run-stability.e2e.ts`)
  - accessibility baseline checks (`m006-accessibility-baseline.e2e.ts`)
  - multi-hour soak artifact generation (`qa:m006:soak`)

## Not Proven Yet (Required in S04)

- Final **packaged-app** end-to-end gate using assembled M006 evidence across all runtime boundaries.
- Real-user acceptance of packaged flow (install → onboarding → planning → execution → Symphony operations) with S03 diagnostics active in packaged mode.
- Final integrated release decision with all S02 + S03 artifacts jointly validated against packaged runtime behavior.

## Assumptions for S04

- S04 consumes S03 as truth for operational long-run baseline, not as substitute for packaged E2E acceptance.
- Any new S04 regressions that impact threshold behavior or accessibility baseline must re-run:
  - S03 targeted vitest suites
  - S03 Playwright long-run/a11y suites
  - `qa:m006:soak` report generation

## Triage Contract for S04

When a regression appears, classify and route with this minimum payload:

- `failure_class` + `breach_code`
- metric/rule name and affected surface
- observed value vs threshold (or violated a11y rule)
- timestamp and last-known-good timestamp
- suggested recovery action
- owner (chat runtime / workflow / symphony / settings-MCP)

## Handoff Status

✅ S03 artifacts are complete and ready for S04 release-gate consumption.
