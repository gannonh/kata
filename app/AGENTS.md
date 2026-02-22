# AGENTS.md (Desktop App)

This file applies to work under `app/` and complements the root `AGENTS.md`.

## Scope

- Use this file for desktop-shell work in `app/`.
- Keep Kata core/plugin workflows in root `AGENTS.md`.
- Treat this file as the authoritative desktop planning/execution guide; keep root-level guidance summary-only.

## Project Management

Linear is the single source of truth for all desktop project management: task priority, execution order, blockers, status, and acceptance criteria.

- Project: [Kata Desktop App](https://linear.app/kata-sh/project/kata-desktop-app-bf73d7f4dfbb/overview)
- Execution model: Linear document "Execution Model: UI Baseline then Parallel Functional Vertical Slices"
- Workflow contract: Linear document "Desktop App Linear Workflow Contract"
- Use the `/kata-linear` skill for ticket lifecycle (start, end, next). Use `/linear` for general Linear queries.
- Always pass `includeRelations: true` when calling `get_issue` to see blocking dependencies.

### Determining What to Work on Next

1. **Check `Todo` status first.** Query issues in the `Kata Desktop App` project with state `Todo`. These have been groomed and are ready to start.
2. **If nothing is in `Todo`, resolve from blocking relations.** Use `get_issue` with `includeRelations: true` on `track:ui-fidelity` issues to find the first issue whose blockers are all `Done`.
3. **Read the execution model document** in Linear for the full dependency contract between pillars (UI baseline vs. functional slices) and lanes.

## Design Specs and Mocks

- Spec index: `_plans/design/specs/README.md` (maps spec numbers to files and mocks)
- Spec files: `_plans/design/specs/*.md` (component inventories, states, interactions, visual tokens)
- Mock PNGs: `_plans/design/mocks/*.md` (numbered in user journey order, README has descriptions)

## Starting Work on an Issue

1. Fetch the issue from Linear with `get_issue` using `includeRelations: true`. Confirm all blockers are `Done`.
2. Identify which design spec(s) apply from the issue description or `_plans/design/specs/README.md`
3. Read the relevant spec file(s) and mock PNGs
4. Check existing components in `src/renderer/components/`
5. Create a feature branch
6. Write failing tests first (TDD is mandatory)

### Completing an Issue

- Do not move issues to `Done` without linked evidence (tests, screenshots, or traceable PR notes) for referenced spec states/interactions.
- After completing an issue, check if the next issue in the blocking chain can be promoted to `Todo`.

## Desktop Architecture

- Main process: `src/main/`
- Preload bridge: `src/preload/`
- Renderer UI: `src/renderer/`
- Unit tests: `tests/unit/`
- E2E/UAT tests: `tests/e2e/`

## SHADCN Adoption

- Desktop renderer UI standard is now SHADCN-first.
- SHADCN UI primitives live in `src/renderer/components/ui/`.
- SHADCN Blocks compositions live in `src/renderer/components/shadcnblocks/`.
- Reuse existing SHADCN primitives/blocks before creating custom renderer UI primitives.
- Keep utility/style composition aligned with the configured SHADCN aliases and tokens in `components.json`.
- For new block pulls from `@shadcnblocks`, ensure `SHADCNBLOCKS_API_KEY` is available in the environment.

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

## Claude Desktop Preview

The renderer can run as a standalone web app for use with Claude Desktop's server preview feature.

```bash
# From app/
npm run dev:web
```

This uses `vite.config.web.ts` which:
- Serves only the renderer on port 5199 (no Electron main/preload)
- Strips `frame-ancestors 'none'` from the CSP so the preview iframe can embed it

The `.claude/launch.json` config points to `dev:web`. After `preview_start`, the preview panel **will** stay on "Awaiting server..." indefinitely. This is a known Claude Preview limitation with this app. Do not debug it. Do not modify `launch.json` (the schema has no `url`/`startUrl` field to fix this).

After every `preview_start`, immediately run these two commands:

```
preview_eval: window.location.href = 'http://localhost:5199'
preview_resize: 1280x800
```

Port 5199 is hardcoded (`strictPort: true`) to avoid the mismatch where Vite auto-increments past the port the preview expects.

## Guardrails

- Keep renderer code browser-safe (`nodeIntegration: false`, `contextIsolation: true`).
- Expose APIs via preload only; avoid direct Node access from renderer.
- Add or update tests for behavior changes in main/preload/renderer.
- Keep E2E tags (`@quality-gate`, `@ci`, `@uat`) aligned with CI jobs.

## Mandatory TDD

1. Test Driven Development is mandatory for all code changes. 
2. Write tests before implementation, ensure they fail, then implement the feature until tests pass.
3. Use the Test Driven Development Agent Skill (`test-driven-development`) for guidance.
