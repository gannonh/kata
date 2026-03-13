---
id: T01
parent: S05
milestone: M002
provides:
  - listKataMilestones(client, projectId) exported from linear-entities.ts
  - LinearEntityClient.listMilestones added to interface
  - LinearStateClient interface (listMilestones + listIssues) exported from linear-state.ts
  - DeriveLinearStateConfig type exported from linear-state.ts
  - deriveLinearState(client, config): Promise<KataState> exported from linear-state.ts
  - All 5 phase outcomes implemented: pre-planning, planning, executing, verifying, summarizing
  - complete phase when all milestones done
  - 32 unit tests in linear-state.test.ts — all pass
key_files:
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/linear-state.ts
  - src/resources/extensions/linear/tests/linear-state.test.ts
key_decisions:
  - Milestone "complete" requires slices.length > 0 && all terminal; zero-slice milestone stays pending/"pre-planning"
  - LinearStateClient is structurally separate from LinearEntityClient; LinearClient satisfies both
  - listKataSlices called once for the whole project, then grouped client-side by projectMilestone?.id
  - activeTask: null in backlog/unstarted (planning) phases; task refs only set in started phase
patterns_established:
  - isTerminal() helper: state.type === "completed" || "canceled"
  - milestoneRef() / issueRef() helpers extract kataId via parseKataEntityTitle with raw-id fallback
  - progress.tasks only populated when children.length > 0 (undefined otherwise)
observability_surfaces:
  - deriveLinearState propagates errors unchanged — callers (T03) wrap in try/catch for blocked state
  - KataState.progress contains milestones/slices/tasks counts for dashboard display
duration: 35m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Add `listKataMilestones`, create `linear-state.ts`, write unit tests

**Implemented `deriveLinearState` with full phase derivation from Linear API milestones and slice issues, backed by 32 passing unit tests.**

## What Happened

Extended `LinearEntityClient` with `listMilestones(projectId)` and added `listKataMilestones` helper (analogous to `listKataSlices`). Created `linear-state.ts` with `LinearStateClient` interface, `DeriveLinearStateConfig` type, and the `deriveLinearState` implementation.

The algorithm:
1. Fetches milestones via `listKataMilestones` (API-sorted by `sortOrder`)
2. Fetches all slice issues in one call via `listKataSlices`, groups client-side by `projectMilestone?.id`
3. Marks a milestone "complete" when `slices.length > 0 && all slices are terminal`
4. Finds active milestone (first non-complete); builds registry (complete/active/pending)
5. Finds active slice (first non-terminal in active milestone's group)
6. Derives phase from slice state type and children completion ratio:
   - `backlog`/`unstarted` → `"planning"` (no active task)
   - `started` + 0 children → `"executing"`, `activeTask: null`
   - `started` + children, 0 terminal → `"executing"`, first non-terminal = `activeTask`
   - `started` + some terminal → `"verifying"`, first non-terminal = `activeTask`
   - `started` + all terminal → `"summarizing"`, `activeTask: null`
7. Calls `getActiveSliceBranch(basePath)` for `activeBranch`; sets `requirements: undefined`

`LinearStateClient` is a separate interface (2 methods) that `LinearClient` satisfies structurally. Errors propagate to callers — T03 adds the `try/catch` for `phase: "blocked"`.

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/linear-state.test.ts
→ 32 tests pass, 0 failures

npx tsc --noEmit
→ no output (clean)

grep exports → 4/4 matches
```

## Diagnostics

- `deriveLinearState` returns structured `KataState` — inspect via mock client in tests or wrap in `kata_derive_state` tool (T02)
- Errors propagate as-is; callers detect `LinearGraphQLError` by type for structured `phase: "blocked"` response

## Deviations

None. Followed T01-PLAN algorithm exactly. `progress.tasks` omitted (undefined) when `children.length === 0`, which matches `KataState` optional field design.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/linear/linear-entities.ts` — Added `listMilestones` to `LinearEntityClient` interface; added `listKataMilestones` function
- `src/resources/extensions/linear/linear-state.ts` — New file: `LinearStateClient`, `DeriveLinearStateConfig`, `deriveLinearState`
- `src/resources/extensions/linear/tests/linear-state.test.ts` — New file: 32 unit tests covering all phase derivation paths
