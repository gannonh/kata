---
estimated_steps: 6
estimated_files: 2
---

# T02: Register agent tools + write integration test

**Slice:** S05 — State Derivation from Linear API
**Milestone:** M002

## Description

Expose `deriveLinearState` and `listKataMilestones` as agent-callable tools, and add `kata_update_issue_state` — the issue state transition tool needed for auto-mode advancement in S06. Then write an integration test that proves the full derivation path against a real Linear workspace: create a hierarchy (milestone → slice → task), derive state, assert correct `KataState` fields, advance an issue state, re-derive to confirm the phase changed.

The `kata_derive_state` tool is designed for zero-ceremony use: it reads `projectId`/`teamId` from project preferences (`loadEffectiveLinearProjectConfig()`), builds a `LinearClient` from `process.env.LINEAR_API_KEY`, calls `ensureKataLabels` to resolve `sliceLabelId`, and returns the full `KataState` JSON. No agent setup required beyond having the project configured for Linear mode.

## Steps

1. **In `linear-tools.ts`**: add imports for `listKataMilestones` from `./linear-entities.js`, `deriveLinearState` from `./linear-state.js`, and `loadEffectiveLinearProjectConfig` from `../../kata/linear-config.js` (already an indirect dependency). Import `getLinearStateForKataPhase` and `KataPhase` type.

2. **Register `kata_list_milestones`**: params `{ projectId: string }`, calls `client.listMilestones(projectId)`, returns milestones sorted by `sortOrder`. Label: `"Kata: List Milestones"`.

3. **Register `kata_derive_state`**: no required params. Implementation: (a) read config from `loadEffectiveLinearProjectConfig()`; (b) check `apiKey = process.env.LINEAR_API_KEY` — if falsy, return `ok({ phase: "blocked", activeMilestone: null, activeSlice: null, activeTask: null, blockers: ["LINEAR_API_KEY not set"], recentDecisions: [], nextAction: "Set LINEAR_API_KEY before calling kata_derive_state.", registry: [] })`; (c) create `new LinearClient(apiKey)`; (d) check `config.linear.projectId` and `config.linear.teamId` present — if not, return `ok({ phase: "blocked", ... blockers: ["Linear project not configured"] })`; (e) call `ensureKataLabels(client, teamId)` to get `sliceLabelId`; (f) call `deriveLinearState(client, { projectId, teamId, sliceLabelId })` wrapped in `run(...)`. Label: `"Kata: Derive Linear State"`.

4. **Register `kata_update_issue_state`**: params `{ issueId: string, phase: union of KataPhase literals, teamId?: string }`. Implementation: (a) resolve `teamId` from params or `loadEffectiveLinearProjectConfig().linear.teamId`; (b) if no teamId, return `fail("teamId required")`; (c) call `client.listWorkflowStates(teamId)`; (d) call `getLinearStateForKataPhase(states, phase)`; (e) if null, return `fail("No workflow state found for phase: ${phase}")`; (f) call `client.updateIssue(issueId, { stateId: state.id })`, return updated issue. Label: `"Kata: Update Issue State"`. Wrap in `run(...)`.

5. **Add re-exports** under `kata_*` names for smoke-check: `listKataMilestones as kata_list_milestones`, `deriveLinearState as kata_derive_linear_state`.

6. **Write `linear-state.integration.test.ts`** following `entity-hierarchy.integration.test.ts` exactly: `before()` resolves team+project, calls `ensureKataLabels`, creates milestone → slice issue → task sub-issue; `after()` cleans up with `Promise.allSettled` (task → slice → milestone); tests:
   - `listKataMilestones` returns the created milestone in the list
   - `deriveLinearState` with the test project config returns a `KataState` where `activeMilestone.id` matches the created milestone's parsed kataId, `activeSlice.id` matches the slice's kataId, `activeTask.id` matches the task's kataId, `phase === "executing"` (task in unstarted/started state)
   - After advancing task to "done" via `kata_update_issue_state`, re-derive state: assert phase reflects the change (executing → verifying or summarizing depending on sibling count)
   - `kata_update_issue_state` returns the updated issue with correct `state.type`
   - `progress.tasks.total` and `progress.tasks.done` are correct counts

## Must-Haves

- [ ] `kata_list_milestones` tool registered in `registerLinearTools`
- [ ] `kata_derive_state` tool registered — reads config from preferences, handles missing key gracefully
- [ ] `kata_update_issue_state` tool registered — resolves phase → stateId internally
- [ ] Re-exports `kata_list_milestones` and `kata_derive_linear_state` for smoke-checks
- [ ] Integration test creates full test hierarchy and proves `deriveLinearState` returns correct `KataState`
- [ ] Integration test proves `kata_update_issue_state` performs a real state transition
- [ ] Total tool count = 40 (`grep -c 'pi.registerTool' linear-tools.ts`)
- [ ] `npx tsc --noEmit` — clean

## Verification

```bash
# Integration test
LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.integration.test.ts
# Expected: all tests pass

# Tool count
grep -c 'pi.registerTool' src/resources/extensions/linear/linear-tools.ts
# Expected: 40

# New tool names present
grep 'kata_list_milestones\|kata_derive_state\|kata_update_issue_state' \
  src/resources/extensions/linear/linear-tools.ts | grep 'name:'
# Expected: 3 matches

# TypeScript
npx tsc --noEmit
# Expected: clean
```

## Observability Impact

- **Signals added/changed:** `kata_derive_state` is the primary observability surface for Linear-mode state — single zero-setup call returns full `KataState` JSON; `phase: "blocked"` with `blockers` array when config or key is missing; `kata_update_issue_state` returns updated issue confirming the state transition was applied
- **How a future agent inspects this:** call `kata_derive_state()` with no params; check `phase`, `activeMilestone`, `activeSlice`, `activeTask`, `progress`, `blockers`; call `kata_list_milestones({ projectId })` to see raw milestone ordering
- **Failure state exposed:** missing `LINEAR_API_KEY` → `ok({ phase: "blocked" })` (not an error response — agent can diagnose and retry); `LINEAR_API_KEY` wrong → `fail("auth_error: ...")` via `run()`; team/project not configured → `ok({ phase: "blocked" })`

## Inputs

- `src/resources/extensions/linear/linear-state.ts` — `deriveLinearState`, `LinearStateClient`, `DeriveLinearStateConfig` (from T01)
- `src/resources/extensions/linear/linear-entities.ts` — `listKataMilestones`, `ensureKataLabels`, `getLinearStateForKataPhase` (T01 + S03)
- `src/resources/extensions/kata/linear-config.ts` — `loadEffectiveLinearProjectConfig` (S02)
- `src/resources/extensions/linear/linear-client.ts` — `LinearClient.listWorkflowStates(teamId)` for state resolution
- `src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts` — follow this structure exactly for the integration test scaffold

## Expected Output

- `src/resources/extensions/linear/linear-tools.ts` — 3 new tools + 2 re-exports; total `pi.registerTool` count = 40
- `src/resources/extensions/linear/tests/linear-state.integration.test.ts` — new file: integration test proving full hierarchy → state derivation → state transition → re-derivation
