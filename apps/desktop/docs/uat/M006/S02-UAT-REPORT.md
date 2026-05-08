# S02 UAT Report — First-Run and Onboarding Beta Readiness

- Slice: **KAT-2400 / S02**
- Child tasks: **KAT-2408 (T01), KAT-2409 (T02), KAT-2410 (T03), KAT-2411 (T04)**
- Milestone: **M006 Integrated Beta**
- Date (UTC): **2026-04-08**
- Tester: **Kata orchestration agent (deterministic packaged-like runtime validation)**
- Environment: **Electron `_electron` with built Desktop artifacts (`dist/main.cjs`, `dist/preload.cjs`, renderer build), isolated user-data dirs, fixture-driven startup/auth modes**

## Run matrix

| Flow | Mode | Result | Notes |
| --- | --- | --- | --- |
| Main-process readiness contract proofs | Vitest | ✅ Pass | `auth-bridge`, `pi-agent-bridge`, `runtime-health-aggregator` |
| Renderer readiness parity proofs | Vitest | ✅ Pass | settings + model selector consistency checks |
| Type system gate | TypeScript (`bun run typecheck`) | ✅ Pass | no type errors |
| Packaged-like build gate | Electron/Vite build | ✅ Pass | `build:main`, `build:preload`, `build:renderer` |
| First-run + onboarding deterministic smoke | Playwright Electron | ✅ Pass | `onboarding.e2e.ts` + `first-run-beta-readiness.e2e.ts` |
| Focused first-run replay | Playwright Electron | ✅ Pass | `first-run-beta-readiness.e2e.ts` only |

## Validation command results

```bash
cd apps/desktop && npx vitest run src/main/__tests__/auth-bridge.test.ts src/main/__tests__/pi-agent-bridge.test.ts src/main/__tests__/runtime-health-aggregator.test.ts
cd apps/desktop && npx vitest run src/renderer/components/settings/__tests__/SettingsPanel.test.tsx src/renderer/components/settings/__tests__/ProviderAuthPanel.test.tsx src/renderer/components/app-shell/__tests__/ModelSelector.test.tsx
cd apps/desktop && bun run typecheck
cd apps/desktop && bun run build:main && bun run build:preload && bun run build:renderer
cd apps/desktop && npx playwright test e2e/tests/onboarding.e2e.ts e2e/tests/first-run-beta-readiness.e2e.ts
cd apps/desktop && npx playwright test e2e/tests/first-run-beta-readiness.e2e.ts
```

- Main Vitest suite: **Pass** (73 tests)
- Renderer Vitest suite: **Pass** (9 tests)
- Typecheck: **Pass**
- Build: **Pass**
- Playwright combined smoke: **Pass** (10/10)
- Playwright focused replay: **Pass** (3/3)

## First-run checkpoint outcomes

| Scenario | Auth | Model | Startup | First turn | Result |
| --- | --- | --- | --- | --- | --- |
| Seeded-auth happy path | pass | pass | pass | pass | ✅ |
| Clean profile (no keys) | fail (actionable guidance) | blocked/fail | pass | fail summary truthful | ✅ |
| Binary-missing startup mode | pass (seeded) | pass | fail (runtime guidance) | blocked by startup | ✅ |
| Seeded provider consistency | pass (`Configured` badge on provider card) | pass | pass | n/a | ✅ |

## Recovery and truthfulness assertions

- ✅ Onboarding provider step, settings auth panel, and model selector remain consistent on provider/model truth.
- ✅ Contradictory provider/model pairing now yields canonical failure (`MODEL_PROVIDER_NOT_CONFIGURED`) instead of throwing cross-surface invariant exceptions.
- ✅ Startup degradation remains legible in both model selector and settings guidance.
- ✅ `first_turn` only passes after a productive turn completes (`agent_end` path observed via deterministic mock runtime events).
- ✅ Diagnostics and reports remain redaction-safe (no raw API keys or tokens surfaced).

## Evidence index

| Artifact | Location | Notes |
| --- | --- | --- |
| Deterministic first-run suite | `apps/desktop/e2e/tests/first-run-beta-readiness.e2e.ts` | Happy path + auth failure + startup degradation |
| Onboarding consistency suite | `apps/desktop/e2e/tests/onboarding.e2e.ts` | Provider consistency + recovery messaging coverage |
| Fixture modes and runtime seams | `apps/desktop/e2e/fixtures/electron.fixture.ts` | clean/seeded auth + healthy/binary-missing startup |
| Shared readiness contract | `apps/desktop/src/shared/first-run-readiness.ts` | Canonical checkpoint composition |
| Runtime aggregator integration | `apps/desktop/src/main/runtime-health-aggregator.ts` | Explicit checkpoint projection + blocked checkpoint resolution |

## Final assessment

- S02 first-run operational readiness proof: **✅ Ready for Agent Review**
- Blocking defects found in this validation run: **None**
- Follow-up tickets created from this run: **None**
