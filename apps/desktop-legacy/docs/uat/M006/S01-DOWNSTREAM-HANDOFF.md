# S01 Downstream Handoff — Reliability Envelope Outputs

## Purpose

This handoff captures what S01 produced for downstream M006 slices (S02/S03/S04), including contract surfaces, deterministic proofs, and reuse checkpoints.

## Produced contract (authoritative)

### Canonical taxonomy

- Classes: `config`, `auth`, `network`, `process`, `stale`, `unknown`
- Severity scale: `info`, `warning`, `error`, `critical`
- Recovery actions: `fix_config`, `reauthenticate`, `retry_request`, `restart_process`, `reconnect`, `refresh_state`, `inspect`
- Outcomes: `pending`, `succeeded`, `failed`, `none`

### Canonical signal envelope

`ReliabilitySignal` includes:

- `code` (stable format: `REL-<SOURCE>-<CLASS>-<CODE_FRAGMENT>`)
- `class`, `severity`, `sourceSurface`
- `recoveryAction`, `outcome`
- `message`, `timestamp`
- optional `staleSince`, `lastKnownGoodAt`, `diagnostics`

### Redaction guarantees

Reliability mapping and bridge stderr handling redact secrets/tokens (`sk-*`, `api_key`, bearer tokens) before surfacing diagnostics.

## Runtime wiring delivered

- Main-process mapper contract: `src/main/reliability-contract.ts`
- Cross-surface aggregator: `src/main/runtime-health-aggregator.ts`
- IPC/preload/public API surface: `window.api.reliability` (`getStatus`, `onStatus`, `requestRecoveryAction`)
- Renderer parity surfaces:
  - App-level reliability banner
  - Kanban board state notice
  - Symphony dashboard recovery notice
  - MCP settings recovery notice

## Deterministic failure-path proofs delivered

### Unit / integration proof set

- `src/main/__tests__/reliability-contract.test.ts`
- `src/main/__tests__/runtime-health-aggregator.test.ts`
- `src/main/__tests__/workflow-board-service.test.ts`
- `src/main/__tests__/symphony-operator-service.test.ts`
- `src/main/__tests__/mcp-service.test.ts`
- `src/main/__tests__/pi-agent-bridge.test.ts` (chat crash fault seam)

### Electron recovery proof

- `e2e/tests/recovery-envelope.e2e.ts`
- Fault classes covered:
  1. workflow transient backend stale/error
  2. Symphony disconnect/restart
  3. malformed MCP config
  4. chat subprocess crash

## Downstream consumption map

### S02 — First-run/onboarding beta readiness

Consume:

- Shared reliability taxonomy + message/action vocabulary for onboarding validation/fail states.
- `window.api.reliability` snapshot/subscription to keep onboarding recovery hints consistent with runtime surfaces.

Required checkpoint:

- Onboarding failure states must map to canonical classes/actions (no onboarding-specific error dialect).

### S03 — Long-run stability/performance/accessibility baseline

Consume:

- Aggregated reliability surface snapshots for long-run degradation tracking.
- Recovery outcome transitions (`pending`→`succeeded|failed`) as measurable stability signals.

Required checkpoint:

- Soak metrics must include per-surface failure/recovery counts by canonical class.

### S04 — Packaged integrated acceptance + release gate

Consume:

- `S01-RECOVERY-SMOKE.md` scenario matrix.
- `recovery-envelope.e2e.ts` deterministic assertions as release-gate regression check.

Required checkpoint:

- Packaged acceptance must replay the same four representative fault classes and preserve truthful LKG/stale behavior.

## Open risks / guardrails for downstream slices

- If new surfaces are added, they must map through the same contract before exposing UI diagnostics.
- Do not introduce raw backend error payloads into renderer state; always pass through redaction + canonical mapper.
- Recovery controls must remain action-labeled by canonical recovery action strings to prevent UX drift.

## Artifact index

- `src/shared/types.ts`
- `src/main/reliability-contract.ts`
- `src/main/runtime-health-aggregator.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/atoms/reliability.ts`
- `src/renderer/components/app-shell/AppShell.tsx`
- `src/renderer/components/kanban/BoardStateNotice.tsx`
- `src/renderer/components/symphony/SymphonyDashboard.tsx`
- `src/renderer/components/settings/McpServerPanel.tsx`
- `e2e/tests/recovery-envelope.e2e.ts`
- `docs/uat/M006/S01-RECOVERY-SMOKE.md`
- `docs/uat/M006/S01-UAT-REPORT.md`
