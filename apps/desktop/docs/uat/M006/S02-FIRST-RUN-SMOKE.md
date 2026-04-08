# S02 First-Run Beta Readiness Smoke (M006)

## Goal

Prove first-run readiness for packaged Desktop flows with explicit checkpoint semantics:

1. `auth` checkpoint is truthful and recoverable.
2. `model` checkpoint is consistent with provider auth state.
3. `startup` checkpoint exposes actionable runtime guidance.
4. `first_turn` checkpoint flips to pass only after a real productive turn.

## Preconditions

- Branch includes S02 first-run readiness wiring and onboarding/settings parity changes.
- Desktop build artifacts exist (`dist/main.cjs`, `dist/preload.cjs`, renderer assets).
- Electron binary is installed (`npx electron --version` succeeds).
- No secret values are logged in traces, screenshots, or report artifacts.

## Deterministic packaged-like smoke

```bash
cd apps/desktop
bun run build:main && bun run build:preload && bun run build:renderer
npx playwright test e2e/tests/onboarding.e2e.ts e2e/tests/first-run-beta-readiness.e2e.ts
npx playwright test e2e/tests/first-run-beta-readiness.e2e.ts
```

> The fixture launches built Desktop bundles (`dist/main.cjs` + `dist/preload.cjs`) with isolated `--user-data-dir` and explicit startup/auth modes (`firstRunProfileMode`, `firstRunStartupMode`). This is the packaged-like validation path used for S02 proof.

## Checkpoint walkthrough

### A. Happy path (seeded auth)

1. Launch on a fresh profile with seeded OpenAI auth state.
2. Complete onboarding.
3. Select `openai/gpt-4.1`.
4. Send first productive turn.
5. Assert `firstRunReadiness.checkpoints.first_turn.status === "pass"`.

### B. Auth failure + recovery guidance (clean profile)

1. Launch on a clean profile with no provider keys.
2. Enter onboarding provider step.
3. Assert onboarding auth guidance banner is visible.
4. Move to key step and verify actionable controls (`Validate & Save`, `Skip for now`).
5. Confirm completion summary truthfully reports `Auth: Fail` when skipping.

### C. Startup degradation guidance (binary missing)

1. Launch with `firstRunStartupMode: "binary_missing"`.
2. Complete onboarding.
3. Assert model selector readiness notice shows runtime degradation guidance.
4. Open settings and assert startup guidance is visible and actionable.

### D. Provider consistency (seeded auth)

1. Launch with seeded auth profile.
2. Enter onboarding provider step.
3. Confirm OpenAI card renders `Configured` badge (no drift vs settings/runtime state).

## Evidence capture requirements

Record in `S02-UAT-REPORT.md`:

- Exact command list and pass/fail outcomes.
- Checkpoint-level outcome table for happy path + failure/recovery paths.
- References to deterministic test sources and fixtures.
- Explicit confirmation that diagnostics remained redaction-safe.
