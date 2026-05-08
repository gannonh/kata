# S01 Recovery Envelope Smoke (M006)

## Goal

Prove one cross-boundary reliability envelope across Desktop runtime boundaries by injecting representative faults and validating:

1. Fault class and severity are normalized (`config`, `auth`, `network`, `process`, `stale`, `unknown`).
2. Last-known-good/stale state is preserved truthfully (no silent empty-state replacement).
3. Recovery action semantics are consistent and actionable.
4. Recovery outcomes are explicit (`pending` → `succeeded|failed`) with stable codes/timestamps.

## Preconditions

- Branch includes S01 reliability contract + runtime aggregator wiring.
- Desktop build artifacts exist (`dist/main.cjs`, `dist/preload.cjs`, renderer build).
- Electron binary is installed and runnable for Playwright `_electron` tests.
- No secret values are written in logs/screenshots/reports.

## Deterministic automated smoke

```bash
cd apps/desktop
bun run build:main && bun run build:preload && bun run build:renderer
npx playwright test e2e/tests/recovery-envelope.e2e.ts
```

Focused invocation used by T04 verification:

```bash
cd apps/desktop
npx playwright test e2e/tests/recovery-envelope.e2e.ts --grep "recovery envelope"
```

## Live recovery walkthrough checkpoints

> The `recovery-envelope.e2e.ts` scenario executes this sequence in a real Electron runtime (main/preload/renderer + IPC + services), with deterministic fault controls.

### A. Workflow transient backend failure (stale state)

1. Set workflow scenario to `scenario:stale` and refresh board.
2. Confirm reliability surface `workflow_board` is `degraded` with class `network`.
3. Confirm `lastKnownGoodAt` is present and retained.
4. Switch to `scenario:recovery` and request workflow recovery.
5. Confirm outcome `succeeded` and surface returns `healthy`.

### B. Symphony disconnect/restart recovery

1. Trigger mock dashboard refresh causing disconnect phase.
2. Confirm reliability surface `symphony` is `degraded` with class `network`.
3. Request recovery action for Symphony.
4. Confirm outcome `succeeded` and surface returns `healthy`.

### C. Malformed MCP config recovery

1. Corrupt MCP JSON config (`{bad-json`).
2. Confirm `window.api.mcp.listServers()` fails.
3. Confirm reliability surface `mcp` is `degraded` with class `config`.
4. Restore valid config and request MCP recovery.
5. Confirm outcome `succeeded` and surface returns `healthy`.

### D. Chat subprocess crash + restart recovery

1. Inject one-time chat crash fault via prompt path.
2. Confirm reliability surface `chat_runtime` is `degraded` with class `process` and stable `REL-CHAT-PROCESS-*` code.
3. Request chat recovery action.
4. Confirm outcome `succeeded` and surface returns `healthy`.

### E. Envelope convergence

1. Confirm final reliability snapshot `overallStatus = healthy`.
2. Confirm all surfaces are `healthy`.

## Evidence requirements

Capture in `S01-UAT-REPORT.md`:

- Command outputs + pass/fail for deterministic smoke.
- Per-fault checkpoint results (class, action, outcome).
- Any deviation details with stable error codes and timestamps.
- Explicit confirmation that no secrets/tokens were exposed.
