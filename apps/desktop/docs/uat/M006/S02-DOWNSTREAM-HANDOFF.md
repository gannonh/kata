# S02 Downstream Handoff — First-Run Readiness Inputs for S04

## Purpose

This handoff captures what S02 now guarantees for first-run beta readiness, what evidence exists, and what S04 (integrated packaged acceptance gate) must still validate at full assembly level.

## What S02 now guarantees

### 1) Canonical first-run checkpoint contract

S02 standardizes and wires the four checkpoint model:

- `auth`
- `model`
- `startup`
- `first_turn`

Each checkpoint is represented with canonical failure metadata aligned to S01 taxonomy (`class`, `severity`, `code`, `recoveryAction`, `timestamp`) and surfaced consistently across onboarding, settings, model selector, and runtime diagnostics.

### 2) Cross-surface provider/model truth consistency

- Provider status semantics are aligned across onboarding and settings.
- Model readiness uses provider-auth consistency checks.
- Contradictory provider/model state now resolves to explicit canonical failure (`MODEL_PROVIDER_NOT_CONFIGURED`) rather than surfacing uncaught invariant exceptions in UI flows.

### 3) Deterministic packaged-like first-run proof coverage

Playwright Electron suites now prove:

- Happy-path first-turn completion (`first_turn: pass`)
- Clean-profile auth-failure guidance and recovery affordances
- Startup degradation guidance (`binary_missing` mode)
- Provider consistency badges for seeded credentials

## Artifacts produced by S02

- `docs/uat/M006/S02-FIRST-RUN-SMOKE.md`
- `docs/uat/M006/S02-UAT-REPORT.md`
- `e2e/tests/onboarding.e2e.ts`
- `e2e/tests/first-run-beta-readiness.e2e.ts`
- `e2e/fixtures/electron.fixture.ts`
- `src/shared/first-run-readiness.ts`
- `src/main/runtime-health-aggregator.ts`

## What S04 can assume from S02

S04 may assume the following are already operational and regression-guarded:

1. First-run checkpoint contract shape and taxonomy semantics are stable.
2. Onboarding/settings/model selector show consistent readiness status and actionable guidance.
3. Deterministic first-run automation can catch auth/model/startup/first-turn regressions.
4. Startup degradation guidance is present and legible in packaged-like runtime modes.

## What S04 must still prove (not closed by S02)

S02 is operational readiness, not final integrated release-gate closure. S04 still needs to prove:

1. Full packaged `.dmg` assembly acceptance (not only packaged-like fixture runs).
2. End-to-end first-run behavior alongside all integrated M006 surfaces under release-like conditions.
3. Final gate sign-off with milestone-wide stability/accessibility/performance constraints applied in assembled packaging.
4. Cross-slice convergence with S03 long-run stability baselines.

## Guardrails for S04

- Do not bypass the canonical first-run checkpoint contract with ad hoc UI-only status logic.
- Preserve canonical failure codes and recovery actions in release-gate assertions.
- Keep redaction guarantees intact (no secret-bearing diagnostics in logs/reports).
- Reuse S02 deterministic suites as pre-gate regression checks before final packaged acceptance walkthrough.
