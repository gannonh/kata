# S06: Workflow Prompt & Auto-Mode Integration

**Goal:** `/kata auto` works in Linear mode — the agent reads plans from Linear, executes work, writes summaries to Linear, advances task and slice states, and auto-mode loops correctly with fresh context per task. `LINEAR-WORKFLOW.md` is injected as the workflow prompt when a project is in Linear mode.
**Demo:** Starting from a Linear workspace with a planned slice (backlog issues in a milestone), running `/kata auto` reads the current state via `kata_derive_state`, dispatches the correct prompt for the active phase, executes work, writes summaries via `kata_write_document`, advances issues via `kata_update_issue_state`, and loops to the next task until the slice is complete.

## Must-Haves

- `src/resources/LINEAR-WORKFLOW.md` exists (≤500 lines), covers Quick Start / Hierarchy / Entity Mapping / Phase Transitions / Artifact Storage / Auto-Mode Contract / Tool Reference, and teaches agents to use `kata_*` tools instead of file I/O
- `loader.ts` sets `LINEAR_WORKFLOW_PATH` env var pointing to the bundled `LINEAR-WORKFLOW.md`
- `before_agent_start` in `index.ts` reads `LINEAR-WORKFLOW.md` from `protocol.path` and injects its content as system prompt when the project is in Linear mode and `protocol.ready` is true
- Stale test assertion in `mode-switching.test.ts` (line ~118: `status.allow === false`) is fixed to `true`
- `getWorkflowEntrypointGuard("auto")` returns `allow: true` in Linear mode
- `startAuto()` uses mode-aware state derivation (skips `deriveState` for `deriveKataState`-equivalent logic) and skips git operations (`ensureSliceBranch`, `switchToMain`, `mergeSliceToMain`) in Linear mode
- `dispatchNextUnit()` dispatches to Linear-mode prompt builders from `linear-auto.ts` for phases: `pre-planning`, `planning`, `executing`, `verifying`, `summarizing`
- Unit tests for Linear auto routing in `linear-auto.test.ts` pass
- `npx tsc --noEmit` is clean

## Proof Level

- This slice proves: integration
- Real runtime required: no (unit tests cover routing; integration against real Linear workspace is optional)
- Human/UAT required: no (all behavior verifiable via unit tests and TypeScript)

## Verification

```bash
# Fix stale test + existing mode-switching suite
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/mode-switching.test.ts
# → 3 pass, 0 fail

# New Linear auto routing unit tests
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts
# → all pass

# Full test suite (all kata tests)
npm test
# → no failures

# TypeScript clean
npx tsc --noEmit
# → no output

# Confirm auto is unblocked in linear mode
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --eval \
  "import { getWorkflowEntrypointGuard } from './src/resources/extensions/kata/linear-config.ts';
   const g = getWorkflowEntrypointGuard('auto', { path: '/tmp/p', scope: 'project', preferences: { workflow: { mode: 'linear' } } });
   console.log(g.allow);"
# → true

# LINEAR-WORKFLOW.md bundled and env var set (confirm in loader)
grep "LINEAR_WORKFLOW_PATH" src/loader.ts
# → exports the env var
```

## Observability / Diagnostics

- Runtime signals: `before_agent_start` injects `LINEAR-WORKFLOW.md` content into system prompt; `workflowModeBlock` note in system prompt names the active mode and path; `dispatchNextUnit()` logs Linear-mode dispatch phase to ctx.ui.notify
- Inspection surfaces: `/kata prefs status` for mode + config health; `kata_derive_state()` zero-arg tool for current phase/active refs; `phase:"blocked"` KataState surfaced as stopped auto-mode with blockers[] message
- Failure visibility: `phase:"blocked"` + `blockers[]` array on missing `LINEAR_API_KEY`, missing team/project config, or Linear API error; auto-mode stops with notify message listing blockers
- Redaction constraints: `LINEAR_API_KEY` is never logged or included in prompts; only `phase`, `blockers[]`, and entity IDs are surfaced

## Integration Closure

- Upstream surfaces consumed:
  - `S02`: `resolveWorkflowProtocol()`, `getWorkflowEntrypointGuard()`, `isLinearMode()`, `loadEffectiveLinearProjectConfig()` from `linear-config.ts`
  - `S05`: `deriveLinearState()` from `linear-state.ts`, `kata_derive_state` tool, `kata_update_issue_state` tool, `deriveKataState()` pattern from `commands.ts`
  - `S04`: `readKataDocument` / `writeKataDocument` from `linear-documents.ts` (agents use these via tools in prompts)
- New wiring introduced in this slice:
  - `LINEAR_WORKFLOW_PATH` env var in `loader.ts` → `resolveWorkflowProtocol()` in `linear-config.ts`
  - `before_agent_start` reads `protocol.path` and injects doc content when `protocol.ready` is true
  - `"auto"` case in `buildLinearEntrypointGuard()` changed from blocked to `allow: true`
  - `startAuto()` gains Linear-mode branch using `resolveKataAutoState()`
  - `dispatchNextUnit()` gains Linear-mode dispatch path calling `linear-auto.ts` builders
  - `linear-auto.ts` — new module with prompt builders for each Linear-mode phase
- What remains before the milestone is truly usable end-to-end: nothing — R107 and R108 are the last unvalidated requirements for M002

## Tasks

- [x] **T01: Write LINEAR-WORKFLOW.md, wire loader env var, inject into system prompt, fix stale test** `est:45m`
  - Why: Delivers R107 — the workflow document and system prompt injection are the prerequisite for agents operating in Linear mode; fixes the only currently-failing test in the suite
  - Files: `src/resources/LINEAR-WORKFLOW.md`, `src/loader.ts`, `src/resources/extensions/kata/index.ts`, `src/resources/extensions/kata/tests/mode-switching.test.ts`
  - Do: (1) Write `src/resources/LINEAR-WORKFLOW.md` with sections: Quick Start / Hierarchy / Entity Mapping / Phase Transitions / Artifact Storage / Auto-Mode Contract / Tool Reference — ≤500 lines, analogous in structure to `KATA-WORKFLOW.md`; teach agents to use `kata_derive_state`, `kata_read_document`, `kata_write_document`, `kata_update_issue_state`, `kata_list_slices`, `kata_list_tasks`; document D028 `* ` bullet normalization; (2) Add `process.env.LINEAR_WORKFLOW_PATH = join(resourcesDir, "LINEAR-WORKFLOW.md")` to `loader.ts` after the existing `KATA_WORKFLOW_PATH` line; (3) In `index.ts` `before_agent_start`, after building `workflowModeBlock`: if `modeGate.protocol.ready && modeGate.protocol.path`, read the file with `readFileSync`, and prepend/append it to the system prompt injection (or inject as a non-display message, matching the `kata-guided-context` pattern); (4) In `mode-switching.test.ts` line ~118, fix `assert.equal(status.allow, false)` → `assert.equal(status.allow, true)` and fix the subsequent `assert.match` to match the actual S05 notice ("Showing live progress derived from Linear API." → match `/live progress/i`)
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/mode-switching.test.ts` → 3 pass, 0 fail; `ls src/resources/LINEAR-WORKFLOW.md` → file exists; `grep LINEAR_WORKFLOW_PATH src/loader.ts` → found
  - Done when: mode-switching.test.ts has 0 failures; `LINEAR-WORKFLOW.md` exists in `src/resources/`; `loader.ts` exports `LINEAR_WORKFLOW_PATH`; system prompt injection reads the file when `protocol.ready` is true

- [x] **T02: Unblock auto entrypoint + create Linear auto-mode prompt builders + wire into startAuto/dispatchNextUnit** `est:90m`
  - Why: Delivers R108 — `/kata auto` must actually dispatch and loop in Linear mode; without this task the entrypoint gate still blocks auto, and even with an open gate there are no Linear-mode prompts to dispatch
  - Files: `src/resources/extensions/kata/linear-config.ts`, `src/resources/extensions/kata/tests/mode-switching.test.ts`, `src/resources/extensions/kata/linear-auto.ts` (new), `src/resources/extensions/kata/auto.ts`
  - Do: (1) In `linear-config.ts` `buildLinearEntrypointGuard()`, change the `"auto"` case from `blockedLinearEntrypoint(...)` to `{ mode: "linear", isLinearMode: true, allow: true, noticeLevel: "info", notice: "Running in Linear mode. State derived from Linear API.", protocol }`; (2) In `mode-switching.test.ts`, update the `auto` assertions in the "blocks file-backed entrypoints" test: `auto.allow === false` → `true`, and remove or update the matching notice assertion; (3) Create `linear-auto.ts` with `resolveLinearKataState(basePath)` helper (mirrors `commands.ts::deriveKataState` pattern but without circular dep — imports `LinearClient`, `ensureKataLabels`, `deriveLinearState`, `isLinearMode`, `loadEffectiveLinearProjectConfig`, `deriveState` directly) and phase-specific prompt builders: `buildLinearExecuteTaskPrompt(state)`, `buildLinearPlanSlicePrompt(state)`, `buildLinearPlanMilestonePrompt(state)`, `buildLinearCompleteSlicePrompt(state)` — each returns a string prompt that orients the agent, tells it the active entity IDs, and instructs it to call `kata_derive_state` at start then use `LINEAR-WORKFLOW.md` for operations; (4) In `auto.ts` `startAuto()`, after the paused-resume early return, add a Linear-mode branch: skip git checks and `.kata/` bootstrap, call `resolveLinearKataState(base)` from `linear-auto.ts` instead of `deriveState(base)`; (5) In `auto.ts` `handleAgentEnd()`, skip `autoCommitCurrentBranch` in Linear mode (guard with `isLinearMode()`); (6) In `auto.ts` `dispatchNextUnit()`, replace the direct `deriveState(basePath)` call with mode-aware dispatch (call `resolveLinearKataState` in Linear mode); add Linear-mode dispatch before each file-mode phase handler: if `isLinearMode()` dispatch to the correct `linear-auto.ts` builder and call `pi.sendMessage()`; skip the `complete-slice` post-merge block in Linear mode; skip `ensureSliceBranch` / `switchToMain` / `mergeSliceToMain` in Linear mode; for `verifying` phase in Linear mode, treat as `executing` (same prompt builder — just pick the next non-terminal task)
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/mode-switching.test.ts` → 3 pass, 0 fail; `npx tsc --noEmit` → clean
  - Done when: `getWorkflowEntrypointGuard("auto")` returns `allow: true` in Linear mode; `dispatchNextUnit()` calls Linear prompt builders for each phase when `isLinearMode()`; git operations are skipped in Linear mode; TypeScript compiles without errors

- [x] **T03: Write unit tests for Linear auto routing + run full test suite** `est:30m`
  - Why: Validates R107 and R108 via executable assertions; proves routing is correct without requiring a real Linear workspace; confirms no regressions in existing tests
  - Files: `src/resources/extensions/kata/tests/linear-auto.test.ts` (new)
  - Do: (1) Create `linear-auto.test.ts` with unit tests covering: (a) `resolveLinearKataState` returns `phase:"blocked"` when `LINEAR_API_KEY` is not set; (b) phase `"executing"` dispatches `buildLinearExecuteTaskPrompt`; (c) phase `"verifying"` dispatches same path as `"executing"` (not a stop); (d) phase `"summarizing"` dispatches `buildLinearCompleteSlicePrompt`; (e) phase `"planning"` dispatches `buildLinearPlanSlicePrompt`; (f) phase `"pre-planning"` dispatches `buildLinearPlanMilestonePrompt`; (g) phase `"complete"` returns `null` (stop signal); use mock KataState objects, no real API calls; (2) Run `npm test` (all kata tests including the new file); (3) Confirm `npx tsc --noEmit` is clean
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-auto.test.ts` → all pass; `npm test` → no failures; `npx tsc --noEmit` → no output
  - Done when: all linear-auto.test.ts assertions pass; npm test exits 0; TypeScript is clean with no errors or unused imports

## Files Likely Touched

- `src/resources/LINEAR-WORKFLOW.md` — new
- `src/loader.ts` — add `LINEAR_WORKFLOW_PATH` env var
- `src/resources/extensions/kata/index.ts` — inject workflow doc in `before_agent_start`
- `src/resources/extensions/kata/tests/mode-switching.test.ts` — fix stale assertions
- `src/resources/extensions/kata/linear-config.ts` — unblock `"auto"` entrypoint
- `src/resources/extensions/kata/linear-auto.ts` — new: prompt builders + `resolveLinearKataState`
- `src/resources/extensions/kata/auto.ts` — mode-aware dispatch in `startAuto`, `handleAgentEnd`, `dispatchNextUnit`
- `src/resources/extensions/kata/tests/linear-auto.test.ts` — new: unit tests
