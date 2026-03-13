---
id: T02
parent: S01
milestone: M003
provides:
  - KataPrPreferences interface exported from preferences.ts
  - normalizePrPreferences function with boolean and base_branch validation
  - pr field wired through validatePreferences and mergePreferences
key_files:
  - src/resources/extensions/kata/preferences.ts
key_decisions:
  - normalizePrPreferences follows the exact structure of normalizeLinearPreferences (return undefined value when no valid keys present, not empty object)
  - boolean fields validated by typeof check; base_branch validated as non-empty string after trim
patterns_established:
  - New preference sub-objects follow the normalizeX / validatePreferences / mergePreferences pattern established by linear and workflow blocks
observability_surfaces:
  - validatePreferences emits named errors e.g. "pr.enabled must be a boolean" visible in /kata prefs status
  - loadEffectiveKataPreferences().preferences.pr exposes the validated pr config for agent inspection
duration: <5min
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T02: Add `KataPrPreferences` schema to `preferences.ts`

**Added `KataPrPreferences` interface, `normalizePrPreferences` validator, and wired `pr` through `validatePreferences`/`mergePreferences` — all 3 `pr-preferences.test.mjs` tests pass.**

## What Happened

Extended `preferences.ts` in four targeted edits:

1. Added `KataPrPreferences` interface (5 optional fields: `enabled`, `auto_create`, `base_branch`, `review_on_create`, `linear_link`) after `KataLinearPreferences`.
2. Added `pr?: KataPrPreferences` to the `KataPreferences` interface.
3. Added `normalizePrPreferences(value: unknown)` function following the same guard-then-iterate pattern as `normalizeLinearPreferences`: early-return `{ errors: [] }` for `undefined`, early-return error for non-object, iterate boolean fields with `typeof` check, validate `base_branch` as non-empty string.
4. Called `normalizePrPreferences` in `validatePreferences` after the `normalizeLinear` block; propagates errors and sets `validated.pr`.
5. Added spread merge in `mergePreferences` after the `linear` block — override-wins semantics matching all other sub-object merges.

## Verification

```
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types \
  --test 'src/resources/extensions/kata/tests/pr-preferences.test.mjs'
# ✔ loadEffectiveKataPreferences reads pr section from global preferences
# ✔ loadEffectiveKataPreferences validates pr section without errors
# ✔ loadEffectiveKataPreferences merges pr section from global into project preferences
# pass 3 / fail 0

npx tsc --noEmit
# (no output — clean)
```

## Diagnostics

- `/kata prefs status` will surface named validation errors for malformed `pr.*` fields (e.g. `pr.enabled must be a boolean`).
- Agent can call `loadEffectiveKataPreferences()` and inspect `.preferences.pr` to confirm the pr config loaded correctly.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/preferences.ts` — added `KataPrPreferences` interface, `pr` field on `KataPreferences`, `normalizePrPreferences` function, and plumbing in `validatePreferences`/`mergePreferences`
