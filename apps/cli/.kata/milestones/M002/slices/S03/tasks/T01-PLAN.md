---
estimated_steps: 4
estimated_files: 3
---

# T01: Types, Title Conventions, and Phase-State Mapping

**Slice:** S03 — Entity Mapping — Hierarchy & Labels
**Milestone:** M002

## Description

Define the TypeScript types and pure functions that encode Kata's entity mapping conventions into the Linear extension. This task has no API calls — everything here is pure logic that T02–T04 depend on. Once this task is done, the naming conventions, title format, and Kata↔Linear state mapping are locked in code and tested.

**Title format:** `[M001] Milestone title`, `[S01] Slice title`, `[T01] Task title`. Round-trippable with a simple regex.

**Phase→StateType mapping:**
- `backlog` → Linear `backlog`
- `planning` → Linear `unstarted`
- `executing` → Linear `started`
- `verifying` → Linear `started`
- `done` → Linear `completed`

**Reverse mapping** (state type → Kata phase):
- `backlog` → `backlog`
- `unstarted` → `planning`
- `started` → `executing` (caller differentiates `verifying` by sub-issue completion ratio — S05's problem)
- `completed` → `done`
- `canceled` → `done` (treat as terminal)

## Steps

1. Extend `linear-types.ts`: add `KataPhase` union, `KataEntityType` union, `KataLabelSet` interface, and `KataEntityCreationConfig` interface.
2. Create `linear-entities.ts`: export `formatKataEntityTitle(kataId, title)` and `parseKataEntityTitle(linearTitle)`.
3. In `linear-entities.ts`: export `getLinearStateTypeForKataPhase(phase)`, `getKataPhaseFromLinearStateType(stateType)`, and `getLinearStateForKataPhase(states, phase)` (picks the first matching workflow state by type, returns `null` if none match).
4. Create `tests/entity-mapping.test.ts`: unit tests covering title format round-trips (format→parse recovers IDs), invalid/missing bracket prefixes return `null`, all phase mappings (forward and reverse), and `getLinearStateForKataPhase` with empty list + missing type + successful match.

## Must-Haves

- [ ] `KataPhase` is exported from `linear-types.ts` as `'backlog' | 'planning' | 'executing' | 'verifying' | 'done'`
- [ ] `KataLabelSet` interface has `milestone`, `slice`, `task` fields each typed as `LinearLabel`
- [ ] `formatKataEntityTitle('M001', 'My Title')` returns `'[M001] My Title'`
- [ ] `parseKataEntityTitle('[S01] Slice name')` returns `{ kataId: 'S01', title: 'Slice name' }`
- [ ] `parseKataEntityTitle('plain title')` returns `null`
- [ ] `getLinearStateTypeForKataPhase('executing')` returns `'started'`
- [ ] `getLinearStateTypeForKataPhase('done')` returns `'completed'`
- [ ] `getKataPhaseFromLinearStateType('unstarted')` returns `'planning'`
- [ ] `getLinearStateForKataPhase([], 'executing')` returns `null` (graceful empty-list handling)
- [ ] All unit tests pass; `npx tsc --noEmit` clean

## Verification

```bash
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts

npx tsc --noEmit
```

## Observability Impact

- Signals added/changed: None — pure functions; no runtime signals
- How a future agent inspects this: `parseKataEntityTitle` is the primary decoding surface; a future agent can call it on any Linear issue title to recover the Kata ID
- Failure state exposed: `parseKataEntityTitle` returns `null` (never throws) — callers can safely handle unrecognized titles

## Inputs

- `src/resources/extensions/linear/linear-types.ts` — existing type file to extend; must not break existing `LinearWorkflowState`, `LinearLabel`, or other types
- `src/resources/extensions/kata/tests/resolve-ts.mjs` — existing TS import resolver for the test runner (reused from S01)
- S01-SUMMARY.md — established the `LinearWorkflowState.type` shape (`"backlog" | "unstarted" | "started" | "completed" | "canceled"`) which the phase mapping depends on

## Expected Output

- `src/resources/extensions/linear/linear-types.ts` — extended with `KataPhase`, `KataEntityType`, `KataLabelSet`, `KataEntityCreationConfig`
- `src/resources/extensions/linear/linear-entities.ts` — new file with pure functions: `formatKataEntityTitle`, `parseKataEntityTitle`, `getLinearStateTypeForKataPhase`, `getKataPhaseFromLinearStateType`, `getLinearStateForKataPhase`
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — new unit test file; all tests passing
