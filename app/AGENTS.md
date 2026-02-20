# AGENTS.md (Desktop App)

This file applies to work under `app/` and complements the root `AGENTS.md`.

## Scope

- Use this file for desktop-shell work in `app/`.
- Keep Kata core/plugin workflows in root `AGENTS.md`.

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

# Run desktop quality gate (lint + @quality-gate E2E subset)
npm run test:app:quality-gate

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
npm run test:e2e:quality-gate
npm run test:e2e:ci
npm run test:e2e
```

## Guardrails

- Keep renderer code browser-safe (`nodeIntegration: false`, `contextIsolation: true`).
- Expose APIs via preload only; avoid direct Node access from renderer.
- Add or update tests for behavior changes in main/preload/renderer.
- Keep E2E tags (`@quality-gate`, `@ci`, `@uat`) aligned with CI jobs.
