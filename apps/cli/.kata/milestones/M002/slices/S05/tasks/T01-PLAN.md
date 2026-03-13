---
estimated_steps: 5
estimated_files: 3
---

# T01: Add `listKataMilestones`, create `linear-state.ts`, write unit tests

**Slice:** S05 — State Derivation from Linear API
**Milestone:** M002

## Description

Add `listKataMilestones` to `linear-entities.ts` (the S03 follow-up), then create `linear-state.ts` with the `LinearStateClient` interface and `deriveLinearState` implementation. Unit tests are written in this task — they drive the algorithm and provide a fast feedback loop without any API key.

The derivation is **pure-issue-state**: milestones listed by `sortOrder`, slices fetched once for the whole project and grouped client-side by `projectMilestone?.id`, phase derived from Linear state types + children completion ratio. No document content parsing (avoids D028 bullet-normalization pitfall). `requirements` is `undefined` in the returned `KataState` (no REQUIREMENTS.md in Linear mode).

## Steps

1. **Extend `linear-entities.ts`**: add `listMilestones(projectId: string): Promise<LinearMilestone[]>` to `LinearEntityClient` interface; add `listKataMilestones(client, projectId): Promise<LinearMilestone[]>` function that delegates to `client.listMilestones(projectId)`.

2. **Create `linear-state.ts`**: define `LinearStateClient` interface (`listMilestones` + `listIssues` — the two methods needed by derivation); define `DeriveLinearStateConfig` (`projectId`, `teamId`, `sliceLabelId`, optional `basePath`).

3. **Implement `deriveLinearState`** — full algorithm:
   - Fetch milestones: `listKataMilestones(client, config.projectId)` — already sorted by `sortOrder` from API
   - If empty: return `{ phase: "pre-planning", activeMilestone: null, ... }`
   - Fetch all slices: `listKataSlices(client, config.projectId, config.sliceLabelId)` — one call, then group client-side by `issue.projectMilestone?.id`
   - Build `registry`: for each milestone, find its slices; milestone is "complete" if `slices.length > 0 && slices.every(isTerminal)` where `isTerminal = state.type === "completed" || state.type === "canceled"`
   - Find active milestone: first with `status !== "complete"`; if all complete → `phase: "complete"`
   - If active milestone has zero slices → `phase: "pre-planning"`, `activeSlice: null`
   - Find active slice: first non-terminal slice in active milestone's group
   - Determine phase from active slice: `backlog`/`unstarted` → `"planning"`; `started` → inspect `slice.children.nodes` completion ratio: 0 terminal → `"executing"`, some but not all terminal → `"verifying"`, all terminal (children.length > 0) → `"summarizing"`
   - Find active task: first non-terminal entry in `slice.children.nodes`
   - Compute `progress` counts from registry + slice/children counts
   - Call `getActiveSliceBranch(config.basePath ?? process.cwd())` for `activeBranch`
   - Set `requirements: undefined`, `recentDecisions: []`, `blockers: []`

4. **Wrap in try/catch**: if `deriveLinearState` throws (e.g., auth error), callers (T03) handle gracefully. `deriveLinearState` itself does not swallow errors — it lets them propagate so callers can build the blocked-state response.

5. **Write `linear-state.test.ts`** using inline mock clients (same pattern as `entity-mapping.test.ts`). Tests must cover:
   - `listKataMilestones` delegates to `client.listMilestones`
   - no milestones → `phase: "pre-planning"`, `activeMilestone: null`, `registry: []`
   - milestones with no slices → `phase: "pre-planning"`, active milestone set, `activeSlice: null`
   - all milestones complete (all slices terminal) → `phase: "complete"`
   - active slice with state type `backlog` → `phase: "planning"`
   - active slice with state type `unstarted` → `phase: "planning"`
   - active slice with state type `started` and 0 children → `phase: "executing"`, `activeTask: null`
   - active slice with state type `started`, some children terminal → `phase: "verifying"`, first non-terminal child = `activeTask`
   - active slice with state type `started`, all children terminal → `phase: "summarizing"`, `activeTask: null`
   - `parseKataEntityTitle` used to extract `kataId` from milestone/slice names into registry IDs
   - `progress` counts populated correctly (milestones done/total, slices done/total, tasks done/total)
   - `registry` entries: complete milestones → "complete", active → "active", remaining → "pending"

## Must-Haves

- [ ] `listKataMilestones(client, projectId)` exported from `linear-entities.ts`
- [ ] `LinearEntityClient.listMilestones` added to interface
- [ ] `LinearStateClient` interface exported from `linear-state.ts` (2 methods: `listMilestones` + `listIssues`)
- [ ] `DeriveLinearStateConfig` type exported from `linear-state.ts`
- [ ] `deriveLinearState(client, config): Promise<KataState>` exported from `linear-state.ts`
- [ ] All 5 phase outcomes handled: `pre-planning`, `planning`, `executing`, `verifying`, `summarizing`
- [ ] `complete` state when all milestones done
- [ ] `requirements: undefined` in all returned `KataState` objects
- [ ] `progress.milestones`, `progress.slices`, `progress.tasks` all populated when data available
- [ ] Unit tests in `linear-state.test.ts` — all pass
- [ ] `npx tsc --noEmit` — clean

## Verification

```bash
# Unit tests
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
# Expected: all tests pass, 0 failures

# TypeScript
npx tsc --noEmit
# Expected: no output (clean)

# Exports present
grep 'export.*listKataMilestones\|export.*deriveLinearState\|export.*LinearStateClient\|export.*DeriveLinearStateConfig' \
  src/resources/extensions/linear/linear-entities.ts \
  src/resources/extensions/linear/linear-state.ts
# Expected: 4 matches
```

## Observability Impact

- **Signals added/changed:** `deriveLinearState` is the new source-of-truth derivation path; returns structured `KataState` — any downstream system can inspect the full state in one call
- **How a future agent inspects this:** `kata_derive_state` tool (registered in T02) wraps `deriveLinearState`; direct import for testing via mock clients
- **Failure state exposed:** `deriveLinearState` propagates `LinearGraphQLError` unchanged; callers (T03) wrap in try/catch and return `phase: "blocked"` with the error message

## Inputs

- `src/resources/extensions/linear/linear-entities.ts` — existing `LinearEntityClient`, `listKataSlices`, `listKataTasks`, `parseKataEntityTitle`, `getKataPhaseFromLinearStateType`
- `src/resources/extensions/linear/linear-client.ts` — `listMilestones(projectId)` already implemented; `LinearClient` satisfies `LinearStateClient` structurally
- `src/resources/extensions/kata/types.ts` — `KataState`, `Phase`, `ActiveRef`, `MilestoneRegistryEntry`
- `src/resources/extensions/kata/worktree.ts` — `getActiveSliceBranch(basePath)` for `activeBranch` field
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — follow the inline mock pattern for unit tests

## Expected Output

- `src/resources/extensions/linear/linear-entities.ts` — `LinearEntityClient` extended with `listMilestones`; `listKataMilestones` function added and exported
- `src/resources/extensions/linear/linear-state.ts` — new file: `LinearStateClient`, `DeriveLinearStateConfig`, `deriveLinearState`
- `src/resources/extensions/linear/tests/linear-state.test.ts` — new file: unit tests covering all phase derivation paths
