---
estimated_steps: 4
estimated_files: 1
---

# T02: Add `KataPrPreferences` schema to `preferences.ts`

**Slice:** S01 — PR Creation & Body Composition
**Milestone:** M003

## Description

Extend `preferences.ts` with the PR preferences schema: `KataPrPreferences` interface, `normalizePrPreferences` normalizer, and updates to `validatePreferences` and `mergePreferences`. Without this, any `pr:` block in `.kata/preferences.md` is silently dropped by the existing whitelist-based validation. After this task, `pr-preferences.test.mjs` passes.

## Steps

1. Add the interface after `KataLinearPreferences`:
   ```ts
   export interface KataPrPreferences {
     enabled?: boolean;
     auto_create?: boolean;
     base_branch?: string;
     review_on_create?: boolean;
     linear_link?: boolean;
   }
   ```
   Add `pr?: KataPrPreferences` to `KataPreferences`.

2. Add `normalizePrPreferences` after `normalizeLinearPreferences`, following that function's exact structure:
   - Return `{ errors: [] }` when `value === undefined`
   - Return `{ errors: ["pr must be an object"] }` for non-object values
   - Validate boolean fields (`enabled`, `auto_create`, `review_on_create`, `linear_link`): skip if undefined, error if not boolean
   - Validate `base_branch` as a non-empty string: skip if undefined, error if not string or empty after trim
   - Return `{ value: normalized, errors }` where `normalized` only contains keys that were present and valid

3. In `validatePreferences`, after the `normalizeLinear` block:
   ```ts
   const normalizedPr = normalizePrPreferences(preferences.pr);
   if (normalizedPr.errors.length > 0) {
     errors.push(...normalizedPr.errors);
   }
   if (normalizedPr.value) {
     validated.pr = normalizedPr.value;
   }
   ```

4. In `mergePreferences`, after the `linear` spread block:
   ```ts
   ...(base.pr || override.pr
     ? {
         pr: {
           ...(base.pr ?? {}),
           ...(override.pr ?? {}),
         },
       }
     : {}),
   ```

## Must-Haves

- [ ] `KataPrPreferences` exported from `preferences.ts` with all 5 fields
- [ ] `pr?: KataPrPreferences` present in `KataPreferences` interface
- [ ] `normalizePrPreferences` validates booleans and `base_branch` string correctly
- [ ] `validatePreferences` calls `normalizePrPreferences` and propagates errors + value
- [ ] `mergePreferences` merges `pr` with override-wins semantics
- [ ] `pr-preferences.test.mjs` passes with zero failures

## Verification

- `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/pr-preferences.test.mjs'` — all assertions pass, exit 0
- `npx tsc --noEmit` — no TypeScript errors in `preferences.ts`

## Observability Impact

- Signals added/changed: `validatePreferences` now emits specific errors for malformed `pr.*` fields (e.g. `"pr.enabled must be a boolean"`) — visible in `/kata prefs status` output
- How a future agent inspects this: `/kata prefs status` surfaces validation errors; agent can call `loadEffectiveKataPreferences()` and check `.preferences.pr`
- Failure state exposed: malformed `pr:` blocks produce named validation errors instead of silent drops

## Inputs

- `src/resources/extensions/kata/preferences.ts` — existing `normalizeLinearPreferences` pattern to follow exactly
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` — from T01; defines the assertions that must pass

## Expected Output

- `src/resources/extensions/kata/preferences.ts` — updated with `KataPrPreferences`, `normalizePrPreferences`, and plumbed into `validatePreferences` / `mergePreferences`
