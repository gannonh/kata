---
id: T01
parent: S03
milestone: M002
provides:
  - KataPhase, KataEntityType, KataLabelSet, KataEntityCreationConfig types in linear-types.ts
  - formatKataEntityTitle / parseKataEntityTitle pure functions
  - getLinearStateTypeForKataPhase / getKataPhaseFromLinearStateType / getLinearStateForKataPhase pure functions
  - entity-mapping.test.ts with 32 passing unit tests
key_files:
  - src/resources/extensions/linear/linear-types.ts
  - src/resources/extensions/linear/linear-entities.ts
  - src/resources/extensions/linear/tests/entity-mapping.test.ts
key_decisions:
  - Title format uses uppercase-only bracket prefix regex ([A-Z0-9]+) so lowercase identifiers never accidentally match
  - verifying maps to Linear "started" (same as executing); callers differentiate by sub-issue completion ratio per S05 plan
  - canceled Linear state maps to Kata "done" (terminal) to prevent phantom active issues
  - getLinearStateForKataPhase returns null (never throws) on empty list or missing type match
patterns_established:
  - All mapping functions are pure (no imports beyond types) — safe to import anywhere without side effects
  - parseKataEntityTitle returns null on mismatch, never throws — safe for unknown titles
observability_surfaces:
  - parseKataEntityTitle is the primary decoding surface; any future agent can call it on a Linear issue title to recover the Kata ID
duration: ~20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Types, Title Conventions, and Phase-State Mapping

**Added `KataPhase` + mapping types to `linear-types.ts`, created `linear-entities.ts` with five pure functions, and verified all 32 unit tests pass with `npx tsc --noEmit` clean.**

## What Happened

Extended `linear-types.ts` with four new exports: `KataPhase` union (`backlog | planning | executing | verifying | done`), `KataEntityType` union (`milestone | slice | task`), `KataLabelSet` interface (three `LinearLabel` fields), and `KataEntityCreationConfig` interface (teamId, projectId, labelSet).

Created `linear-entities.ts` with five pure functions:
- `formatKataEntityTitle(kataId, title)` → `[M001] My Title`
- `parseKataEntityTitle(linearTitle)` → `{ kataId, title } | null`
- `getLinearStateTypeForKataPhase(phase)` → Linear state type string
- `getKataPhaseFromLinearStateType(stateType)` → `KataPhase`
- `getLinearStateForKataPhase(states, phase)` → first matching `LinearWorkflowState | null`

Created `tests/entity-mapping.test.ts` with 32 tests across 5 suites covering: title formatting, round-trip parse, all invalid-title edge cases, all 5 forward phase mappings, all 5 reverse state-type mappings, and 8 getLinearStateForKataPhase cases (empty list, missing type, successful matches, first-wins tie-breaking).

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/linear/tests/entity-mapping.test.ts
# 32 pass, 0 fail

npx tsc --noEmit
# (no output — clean)
```

## Diagnostics

`parseKataEntityTitle` is the primary decoding surface for downstream agents. Call it on any Linear issue title to recover the Kata ID. Returns `null` on no match — never throws.

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `src/resources/extensions/linear/linear-types.ts` — added KataPhase, KataEntityType, KataLabelSet, KataEntityCreationConfig
- `src/resources/extensions/linear/linear-entities.ts` — new file; five pure mapping functions
- `src/resources/extensions/linear/tests/entity-mapping.test.ts` — new file; 32 unit tests
