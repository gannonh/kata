# AGENTS.md (Desktop App)

This file applies to work under `app/` and complements the root `AGENTS.md`.

## Scope

- Use this file for desktop-shell work in `app/`.
- Keep Kata core/plugin workflows in root `AGENTS.md`.
- Treat this file as the authoritative desktop planning/execution guide; keep root-level guidance summary-only.

## Desktop PM (Linear-Native)

- Project: `Kata Desktop App`
- Board: `https://linear.app/kata-sh/project/kata-desktop-app-bf73d7f4dfbb/overview`
- Execution model: `https://linear.app/kata-sh/document/execution-model-ui-baseline-then-parallel-functional-vertical-slices-b64c15e0a0f2`
- Canonical design specs: `_plans/design/specs/README.md`

Execution order:

1. `pillar:ui-baseline` first (`KAT-17`, `KAT-18`, `KAT-19`)
2. `pillar:functional-slice` next via parallel lanes

Parallel lanes:

- `lane:orchestrator-core`
- `lane:git-pr`
- `lane:verification`

Current functional slices:

- `KAT-47`..`KAT-50` (slice parents)
- `KAT-51`..`KAT-62` (owned/estimated sub-issues)

Current enforced policy:

1. UI baseline first, then functional slices.
2. UI fidelity work is mandatory before baseline implementation starts.
3. Functional slices remain blocked until baseline parents are complete.

Current UI fidelity-first sequence (strict blockers):

1. `KAT-63` -> 2. `KAT-69` -> 3. `KAT-64` -> 4. `KAT-65` -> 5. `KAT-66` -> 6. `KAT-67` -> 7. `KAT-68`

Current kickoff:

- Start active execution at `KAT-63` (status: `Todo`)

Where this sequence gates baseline work:

- Spec 01 (`KAT-17`): `KAT-24`/`KAT-25` blocked by fidelity; `KAT-26` blocked by `KAT-24` + `KAT-25`
- Spec 02 (`KAT-18`): `KAT-27`/`KAT-28` blocked by fidelity; `KAT-29` blocked by `KAT-27` + `KAT-28`
- Spec 03 (`KAT-19`): `KAT-30`/`KAT-31` blocked by fidelity; `KAT-32` blocked by `KAT-30` + `KAT-31`

Saved view setup guide:

- `https://linear.app/kata-sh/document/saved-views-setup-ui-fidelity-first-sequential-execution-7626a0f3b4a2`

Hard gate:

- Do not move desktop issues to `Done` without linked evidence for referenced spec states/interactions and mock parity.

## Desktop Architecture

- Main process: `src/main/`
- Preload bridge: `src/preload/`
- Renderer UI: `src/renderer/`
- Unit tests: `tests/unit/`
- E2E/UAT tests: `tests/e2e/`

## Commands

From repo root (preferred):

```bash
# Run desktop app in dev mode
npm run dev

# Run desktop unit tests
npm run test:app

# Run desktop coverage gate
npm run test:app:coverage

# Run desktop quality gate (lint + coverage + @quality-gate E2E subset)
npm run test:app:quality-gate

# Run all desktop CI-equivalent checks locally
npm run -w app test:ci:local

# Run CI-tagged desktop E2E
npm run test:app:e2e:ci

# Run full desktop UAT E2E
npm run test:app:e2e
```

From `app/` directly:

```bash
npm run lint
npm run test
npm run test:coverage
npm run test:ci:local
npm run test:e2e:quality-gate
npm run test:e2e:ci
npm run test:e2e
```

## Guardrails

- Keep renderer code browser-safe (`nodeIntegration: false`, `contextIsolation: true`).
- Expose APIs via preload only; avoid direct Node access from renderer.
- Add or update tests for behavior changes in main/preload/renderer.
- Keep E2E tags (`@quality-gate`, `@ci`, `@uat`) aligned with CI jobs.

## Mandatory TDD

1. Test Driven Development is mandatory for all code changes. 
2. Write tests before implementation, ensure they fail, then implement the feature until tests pass.
3. Use the Test Driven Development Agent Skill (`test-driven-development`) for guidance.
