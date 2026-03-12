# S02: Project Configuration & Mode Switching

**Goal:** Let each project declare file mode vs Linear mode in project preferences, validate the Linear team/project binding against the live Linear API, and expose centralized mode detection that downstream slices can safely consume.
**Demo:** A project can opt into Linear mode in `.kata/preferences.md`, `/kata prefs status` reports the active workflow mode plus Linear config health, and Kata entrypoints detect the configured mode instead of assuming file mode.

## Must-Haves

- Project preferences support `workflow.mode` plus a `linear` config block for team/project binding, and the loader remains backward-compatible with existing `.kata/preferences.md` / `.kata/PREFERENCES.md` files
- A centralized config module exports `getWorkflowMode()`, `isLinearMode()`, `getLinearTeamId()`, and `getLinearProjectId()` as specified in the M002 boundary map
- Linear-mode config can be validated against the live Linear API using the S01 `LinearClient`, with structured diagnostics for missing API key, missing team, invalid team, invalid project, and network/auth failures
- `/kata prefs status` surfaces the active mode and Linear config health without exposing secrets, and file-mode projects keep their current behavior unchanged
- Kata entrypoints that need workflow awareness consume the centralized mode resolver so Linear-configured projects are detected before file-based workflow assumptions are applied

## Proof Level

- This slice proves: **integration** — real project configuration loading plus live Linear team/project validation and mode-aware CLI detection
- Real runtime required: **yes** — automated proof includes `LINEAR_API_KEY` and network access to the Linear API
- Human/UAT required: **no** — command/status checks and automated tests are sufficient for this slice

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts` — preference parsing, legacy path compatibility, mode detection, and guarded entrypoint behavior pass
- `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts` — live Linear validation resolves configured team/project bindings and surfaces structured failures
- `npx tsc --noEmit` — new config and mode-aware wiring type-check cleanly
- `/kata prefs status` on a Linear-configured project reports `mode: linear`, the configured team/project identifiers, and validation outcome without printing secret values

## Observability / Diagnostics

- Runtime signals: `workflow.mode` is normalized to a stable enum (`file` / `linear`); Linear config validation returns stable diagnostic codes like `missing_linear_api_key`, `missing_linear_team`, `invalid_linear_team`, `invalid_linear_project`, and `linear_network_error`
- Inspection surfaces: `/kata prefs status` shows effective mode + validation summary; `linear-config.ts` exposes a structured validation result for downstream callers and tests
- Failure visibility: status output includes which config field is missing or invalid, whether the failure is auth/network/schema-related, and whether file mode fallback is still active
- Redaction constraints: `LINEAR_API_KEY` presence may be reported, but its value must never be logged, echoed, or written to plan/status artifacts

## Integration Closure

- Upstream surfaces consumed: `src/resources/extensions/linear/linear-client.ts`, `src/resources/extensions/linear/linear-tools.ts`, `src/resources/extensions/kata/preferences.ts`, `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/index.ts`, `src/resources/extensions/kata/guided-flow.ts`
- New wiring introduced in this slice: centralized mode/config resolution is plugged into preference loading, `/kata prefs status`, and the workflow entrypoints that need to know whether the project is file-backed or Linear-configured
- What remains before the milestone is truly usable end-to-end: S03 still has to map Kata milestones/slices/tasks onto Linear entities, S04 still has to store artifacts as Linear Documents, S05 still has to derive state from Linear, and S06 still has to swap workflow prompts + auto-mode behavior. This slice does **not** yet deliver full Linear-mode execution.

## Tasks

- [ ] **T01: Extend project preferences for workflow mode and Linear binding** `est:35m`
  - Why: The mode switch has to live in a durable per-project config surface before any runtime code can branch on it, and the current lowercase/uppercase preferences filename split must be reconciled first.
  - Files: `src/resources/extensions/kata/preferences.ts`, `src/resources/extensions/kata/gitignore.ts`, `src/resources/extensions/kata/templates/preferences.md`, `src/resources/extensions/kata/docs/preferences-reference.md`, `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
  - Do: Add typed `workflow` and `linear` config sections to the preferences schema, make project preference loading accept canonical `.kata/preferences.md` with fallback to legacy `.kata/PREFERENCES.md`, update the generated template/docs to show the new fields, and add parser tests for nested frontmatter plus legacy filename compatibility.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
  - Done when: A project can declare `workflow.mode: linear` and a `linear` block in preferences, the config loads from both supported filenames, and the docs/template match the real schema.

- [ ] **T02: Build centralized Linear config resolution and live validation helpers** `est:45m`
  - Why: Downstream slices need one source of truth for mode detection and team/project lookup, and this slice's proof depends on validating the configured binding against the real Linear workspace.
  - Files: `src/resources/extensions/kata/linear-config.ts`, `src/resources/extensions/kata/preferences.ts`, `src/resources/extensions/kata/tests/linear-config.test.ts`, `src/resources/extensions/kata/tests/linear-config.integration.test.ts`, `src/resources/extensions/linear/linear-client.ts`
  - Do: Create `linear-config.ts` with `getWorkflowMode()`, `isLinearMode()`, `getLinearTeamId()`, `getLinearProjectId()`, effective-config loading, and `validateLinearProjectConfig()` that uses `LinearClient` to resolve configured team/project IDs or keys and returns structured diagnostic codes without leaking secrets.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.test.ts` and `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts`
  - Done when: Callers can ask one module whether the project is in Linear mode and whether its Linear binding is valid, and the integration test proves the configured team/project can be resolved against the live API.

- [ ] **T03: Expose active mode and config health in `/kata prefs status`** `est:35m`
  - Why: This slice needs a real user-visible result, not just internal helpers; `/kata prefs status` is the lightest existing surface for showing that a project is configured for Linear mode and whether the binding is usable.
  - Files: `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/linear-config.ts`, `src/resources/extensions/kata/tests/prefs-status.test.ts`, `src/resources/extensions/kata/docs/preferences-reference.md`
  - Do: Update `/kata prefs status` to report the effective workflow mode, preference file path in use, team/project identifiers, and config-validation summary. Wire it to the centralized validation helper, degrade gracefully when `LINEAR_API_KEY` is missing, and make the output explicitly say when the project remains in file mode.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/prefs-status.test.ts`
  - Done when: Running `/kata prefs status` clearly tells the user whether the project is in file mode or Linear mode and whether the configured Linear binding is ready for downstream slices.

- [ ] **T04: Wire centralized mode detection into Kata entrypoints without breaking file mode** `est:40m`
  - Why: Mode switching is only real if the main Kata entrypoints stop hard-coding file-mode assumptions and instead consult the shared resolver before dispatch.
  - Files: `src/resources/extensions/kata/index.ts`, `src/resources/extensions/kata/guided-flow.ts`, `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/auto.ts`, `src/resources/extensions/kata/linear-config.ts`, `src/resources/extensions/kata/tests/mode-switching.test.ts`
  - Do: Replace scattered implicit file-mode assumptions with `getWorkflowMode()` / `isLinearMode()` checks in the command dispatch and entrypoint helpers that need workflow awareness. Keep existing file-mode behavior unchanged, surface clear mode-aware notices or guarded branching for Linear-configured projects, and make the wiring explicit instead of letting callers parse preferences ad hoc.
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/mode-switching.test.ts` and `npx tsc --noEmit`
  - Done when: File-mode projects still follow the current workflow unchanged, Linear-configured projects are detected through the shared resolver at the relevant entrypoints, and no command has to hand-parse preferences to learn the mode.

## Files Likely Touched

- `src/resources/extensions/kata/preferences.ts`
- `src/resources/extensions/kata/linear-config.ts`
- `src/resources/extensions/kata/commands.ts`
- `src/resources/extensions/kata/index.ts`
- `src/resources/extensions/kata/guided-flow.ts`
- `src/resources/extensions/kata/auto.ts`
- `src/resources/extensions/kata/gitignore.ts`
- `src/resources/extensions/kata/templates/preferences.md`
- `src/resources/extensions/kata/docs/preferences-reference.md`
- `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
- `src/resources/extensions/kata/tests/linear-config.test.ts`
- `src/resources/extensions/kata/tests/linear-config.integration.test.ts`
- `src/resources/extensions/kata/tests/prefs-status.test.ts`
- `src/resources/extensions/kata/tests/mode-switching.test.ts`
