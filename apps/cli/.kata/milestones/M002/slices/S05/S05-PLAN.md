# S05: State Derivation from Linear API

**Goal:** Implement `deriveLinearState(client, config) → KataState` — the Linear-mode equivalent of `deriveState(basePath)` — and wire it into `/kata status` and the dashboard overlay so both surfaces show live progress from Linear API queries instead of file reads.

**Demo:** In a Linear-mode project, `/kata status` opens the dashboard overlay showing the correct active milestone, active slice, active task, phase, and progress counts derived from Linear API queries. The `kata_derive_state` agent tool returns a full `KataState` JSON in one call. The `kata_update_issue_state` tool advances an issue's state to a given Kata phase. All this works without any local `.kata/` state files.

## Must-Haves

- `listKataMilestones(client, projectId)` added to `linear-entities.ts` and `LinearEntityClient` interface
- `LinearStateClient` interface + `deriveLinearState(client, config)` in new `linear-state.ts`
- State derivation is pure-issue-state: no document parsing, no `.kata/` file reads
- Phase `verifying` distinguished from `executing` by sub-issue completion ratio
- Phase `summarizing` detected when active slice is `started` and all its children are complete
- `LINEAR_API_KEY` missing → graceful fallback with `phase: "blocked"` and diagnostic message
- Empty milestone (no slices yet) → `phase: "pre-planning"`, `activeSlice: null`
- All milestones complete → `phase: "complete"`
- Three new agent tools: `kata_list_milestones`, `kata_derive_state`, `kata_update_issue_state`
- `kata_update_issue_state` resolves phase → stateId internally via `listWorkflowStates`
- `buildLinearEntrypointGuard` updated: "status" and "dashboard" now return `allow: true` in Linear mode
- `handleStatus()` in `commands.ts` dispatches to `deriveLinearState` when in Linear mode
- `KataDashboardOverlay.loadData()` dispatches to `deriveLinearState` when in Linear mode; `LinearClient` cached in overlay instance (not re-created on every 2s refresh cycle)
- `npx tsc --noEmit` clean throughout
- Unit tests: `tests/linear-state.test.ts` — all pass
- Integration test: `tests/linear-state.integration.test.ts` — proves full hierarchy → state derivation against real Linear API

## Proof Level

- This slice proves: integration
- Real runtime required: yes (integration test hits real Linear API; `LINEAR_API_KEY` required)
- Human/UAT required: no (wiring verified by TypeScript + integration test)

## Verification

```bash
# Unit tests
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
# Expected: all tests pass

# Integration test
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.integration.test.ts
# Expected: all tests pass against real Linear workspace

# TypeScript
npx tsc --noEmit
# Expected: no errors

# Tool count
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# Expected: 40 (37 pre-S05 + 3 new)

# Status/dashboard allowed in Linear mode (smoke-check via grep)
grep -A 6 '"status"' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'
# Expected: match (status now allowed in Linear mode)
```

## Observability / Diagnostics

- **Runtime signals:** `kata_derive_state` tool returns full `KataState` JSON — single zero-setup call to inspect Linear-mode state; `phase: "blocked"` with `blockers: ["LINEAR_API_KEY not set"]` when env key absent
- **Inspection surfaces:** `kata_list_milestones({ projectId })` — zero-side-effect enumeration; `kata_derive_state()` — full state in one call; `kata_update_issue_state({ issueId, phase })` — confirms state transition by returning updated issue
- **Failure visibility:** `deriveLinearState` catches `LinearGraphQLError` and returns `phase: "blocked"` with the error message in `blockers[]`; dashboard overlay's existing `try/catch` in `loadData()` preserves non-crash behavior
- **Redaction constraints:** `LINEAR_API_KEY` never included in tool output; error messages from Linear API do not contain the API key

## Integration Closure

- **Upstream surfaces consumed:**
  - `listMilestones(projectId)` from `LinearClient` (existing)
  - `listKataSlices`, `listKataTasks`, `parseKataEntityTitle`, `getKataPhaseFromLinearStateType`, `ensureKataLabels` from `linear-entities.ts` (S03)
  - `getWorkflowEntrypointGuard`, `loadEffectiveLinearProjectConfig`, `isLinearMode` from `linear-config.ts` (S02)
  - `getActiveSliceBranch(basePath)` from `worktree.ts` (reads git, not `.kata/` files)
- **New wiring introduced:**
  - `linear-state.ts` exports `deriveLinearState` — wired into `commands.ts` and `dashboard-overlay.ts`
  - `buildLinearEntrypointGuard` updated to allow "status"/"dashboard" in Linear mode
  - `KataDashboardOverlay` caches `LinearClient` instance; `loadData()` is mode-aware
- **What remains before M002 milestone is truly usable end-to-end:** S06 — workflow prompt injection + auto-mode execution loop in Linear mode

## Tasks

- [x] **T01: Add `listKataMilestones`, create `linear-state.ts`, write unit tests** `est:50m`
  - Why: The core derivation algorithm and its `LinearStateClient` contract need to exist (and be tested) before tools or caller wiring can build on top of them. Unit tests are written in this task — they drive the implementation and provide a fast feedback loop without requiring a real API key.
  - Files: `src/resources/extensions/linear/linear-entities.ts`, `src/resources/extensions/linear/linear-state.ts` (new), `src/resources/extensions/linear/tests/linear-state.test.ts` (new)
  - Do:
    1. In `linear-entities.ts`: add `listMilestones(projectId: string): Promise<LinearMilestone[]>` to `LinearEntityClient` interface; add `listKataMilestones(client, projectId)` function that calls `client.listMilestones(projectId)` — analogous to `listKataSlices`.
    2. Create `linear-state.ts` with `LinearStateClient` interface (has `listMilestones` + `listIssues`); `DeriveLinearStateConfig` (`projectId`, `teamId`, `sliceLabelId`, optional `basePath`); and `deriveLinearState(client, config): Promise<KataState>`.
    3. Implement `deriveLinearState` algorithm: (a) call `listKataMilestones` — if empty, return `phase: "pre-planning"`; (b) call `listKataSlices` to get all slices for the project (one query, client-side milestone grouping via `issue.projectMilestone?.id`); (c) build `registry: MilestoneRegistryEntry[]` — milestone is "complete" when all its slices have state type `completed`/`canceled` (or it has zero slices and a later milestone is active); (d) find active milestone (first non-complete); (e) find active slice in active milestone (first non-terminal by state type); (f) determine phase using `getKataPhaseFromLinearStateType` + children completion ratio for `verifying` vs `executing` vs `summarizing`; (g) find active task (first non-terminal child from `slice.children.nodes`); (h) build and return `KataState` with `requirements: undefined` (no REQUIREMENTS.md in Linear mode), `activeBranch` from `getActiveSliceBranch(config.basePath ?? process.cwd())`.
    4. Phase derivation rules: state type `backlog`/`unstarted` → `"planning"`; state type `started` with 0 terminal children → `"executing"`; state type `started` with some but not all children terminal → `"verifying"`; state type `started` with all children terminal (any children exist) → `"summarizing"`; state type `completed`/`canceled` → terminal (not active). No milestone → `"pre-planning"`. No slices → `"pre-planning"`. All milestones complete → `"complete"`.
    5. Write `linear-state.test.ts` covering: no milestones → pre-planning; no slices → pre-planning; all milestones complete → complete; active slice in backlog/unstarted → planning; started with no children → executing; started with some children done → verifying; started with all children done → summarizing; missing API key path (graceful fallback tested at `deriveLinearState` level via try/catch behavior); `listKataMilestones` unit test (calls through mock client).
  - Verify: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/linear-state.test.ts` — all pass; `npx tsc --noEmit` — clean
  - Done when: all unit tests pass, TypeScript clean, `listKataMilestones` exported from `linear-entities.ts`, `deriveLinearState` exported from `linear-state.ts`

- [x] **T02: Register agent tools + write integration test** `est:45m`
  - Why: Exposes `deriveLinearState` and `listKataMilestones` as agent-callable tools; proves the algorithm produces correct output against a real Linear workspace with a real hierarchy. `kata_update_issue_state` is added here because it's the companion mutation tool needed for auto-mode advancement (S06 depends on it).
  - Files: `src/resources/extensions/linear/linear-tools.ts`, `src/resources/extensions/linear/tests/linear-state.integration.test.ts` (new)
  - Do:
    1. In `linear-tools.ts`: import `listKataMilestones` from `linear-entities.ts`; import `deriveLinearState` and `LinearStateClient` from `linear-state.ts`; import `loadEffectiveLinearProjectConfig` from `../../kata/linear-config.js`; import `ensureKataLabels` (already imported).
    2. Register `kata_list_milestones` tool: params `{ projectId: string }`, calls `client.listMilestones(projectId)` — returns paginated milestones sorted by `sortOrder`.
    3. Register `kata_derive_state` tool: no required params (reads `projectId`/`teamId` from `loadEffectiveLinearProjectConfig()`); internally calls `ensureKataLabels` to resolve `sliceLabelId`, then calls `deriveLinearState`; returns `KataState` JSON. Handle missing `LINEAR_API_KEY` by returning `ok({ phase: "blocked", blockers: ["LINEAR_API_KEY not set"] })` rather than throwing.
    4. Register `kata_update_issue_state` tool: params `{ issueId: string, phase: KataPhase, teamId?: string }`; resolves `teamId` from params or `loadEffectiveLinearProjectConfig()`; calls `client.listWorkflowStates(teamId)`, calls `getLinearStateForKataPhase(states, phase)`, calls `client.updateIssue(issueId, { stateId })`, returns updated issue. If no matching state found for phase, return `fail("No workflow state found for phase: ${phase}")`.
    5. Add re-exports for the new functions under `kata_*` names for smoke-check compatibility.
    6. Write `linear-state.integration.test.ts` following the `entity-hierarchy.integration.test.ts` pattern exactly: `before()` creates full test hierarchy (labels → milestone → slice issue → task sub-issue), `after()` cleans up with `Promise.allSettled`; tests: `listKataMilestones` returns the created milestone; `deriveLinearState` returns correct active milestone/slice/task; phase is `executing` (task in progress); advancing task to completed changes slice phase to `summarizing` (or `verifying` depending on setup); `kata_update_issue_state` resolves phase → stateId correctly.
  - Verify: `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/linear/tests/linear-state.integration.test.ts` — all pass; `grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts` → 40; `npx tsc --noEmit` — clean
  - Done when: integration test passes, tool count is 40, TypeScript clean

- [x] **T03: Unblock status/dashboard + wire `deriveLinearState` into callers** `est:40m`
  - Why: The derivation function is implemented and tested, but `/kata status` and the dashboard still derive from `.kata/` files in Linear mode. This task wires the mode-aware dispatch into both callers and unblocks the Linear entrypoint guard — making R104 and R109 actually observable from the user-facing surface.
  - Files: `src/resources/extensions/kata/linear-config.ts`, `src/resources/extensions/kata/commands.ts`, `src/resources/extensions/kata/dashboard-overlay.ts`
  - Do:
    1. In `linear-config.ts`: update the `"status"` and `"dashboard"` cases in `buildLinearEntrypointGuard` to return `{ allow: true, noticeLevel: "info", notice: "Showing live progress from Linear API.", ... }` instead of `blockedLinearEntrypoint(...)`.
    2. In `commands.ts`: add imports for `LinearClient` from `../linear/linear-client.js`, `ensureKataLabels` from `../linear/linear-entities.js`, `deriveLinearState` from `../linear/linear-state.js`. Create a module-level `async function deriveKataState(basePath: string): Promise<KataState>` that checks `isLinearMode()`, and if true: reads config via `loadEffectiveLinearProjectConfig()`, builds `LinearClient` from `process.env.LINEAR_API_KEY`, calls `ensureKataLabels`, calls `deriveLinearState`; if file mode: calls `deriveState(basePath)`. Handle missing API key gracefully (return `{ phase: "blocked", blockers: ["LINEAR_API_KEY not set"], ... }`). Update `handleStatus()` to call `deriveKataState(basePath)` instead of `deriveState(basePath)`.
    3. In `dashboard-overlay.ts`: add import for `LinearClient`, `ensureKataLabels`, `deriveLinearState`, `isLinearMode`, `loadEffectiveLinearProjectConfig`. Add `private linearClient?: LinearClient` field to `KataDashboardOverlay`. Update `loadData()`: if `isLinearMode()`, create/reuse `this.linearClient` from `process.env.LINEAR_API_KEY`; call `ensureKataLabels` once (cache label IDs in instance fields or resolve per call — resolving per call is acceptable for now given idempotency); call `deriveLinearState` and build `MilestoneView` from the returned `KataState`; wrap in try/catch (existing pattern). If not Linear mode, existing `deriveState(base)` path unchanged.
    4. Verify the existing `MilestoneView` rendering path in the overlay is compatible with `KataState` output (check slice/task arrays, progress counts). The `KataState.progress.slices` and `KataState.progress.tasks` fields must be populated for the overlay to show correct counts — ensure `deriveLinearState` sets these.
    5. Run `npx tsc --noEmit` and fix any type errors.
  - Verify: `npx tsc --noEmit` — clean; `grep -A 6 '"status"' src/resources/extensions/kata/linear-config.ts | grep 'allow: true'` — matches; unit tests still pass; integration test still passes
  - Done when: TypeScript clean, status/dashboard allowed in Linear mode, `deriveKataState` dispatches correctly in both modes

## Files Likely Touched

- `src/resources/extensions/linear/linear-entities.ts`
- `src/resources/extensions/linear/linear-state.ts` (new)
- `src/resources/extensions/linear/linear-tools.ts`
- `src/resources/extensions/linear/tests/linear-state.test.ts` (new)
- `src/resources/extensions/linear/tests/linear-state.integration.test.ts` (new)
- `src/resources/extensions/kata/linear-config.ts`
- `src/resources/extensions/kata/commands.ts`
- `src/resources/extensions/kata/dashboard-overlay.ts`
