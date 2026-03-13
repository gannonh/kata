---
id: T01
parent: S01
milestone: M003
provides:
  - pr-lifecycle extension stub (no-op entry point)
  - scripts/ directory placeholder
  - pr-preferences.test.mjs — failing preference schema test (done condition for T02)
  - pr-body-composer.test.ts — failing body composer test (done condition for T03)
key_files:
  - src/resources/extensions/pr-lifecycle/index.ts
  - src/resources/extensions/pr-lifecycle/scripts/.gitkeep
  - src/resources/extensions/kata/tests/pr-preferences.test.mjs
  - src/resources/extensions/kata/tests/pr-body-composer.test.ts
key_decisions:
  - Import path for pr-body-composer test is `../../pr-lifecycle/pr-body-composer.js` (not `../../extensions/pr-lifecycle/...` as written in the task plan — the task plan path had a double `extensions/` segment)
patterns_established:
  - pr-lifecycle tests follow the same node:test / assert pattern as existing kata tests
  - Body composer test uses top-level await import so MODULE_NOT_FOUND surfaces immediately at file parse time
observability_surfaces:
  - Both test files are self-documenting; running them shows exactly what T02 and T03 must deliver
duration: 15min
verification_result: passed
blocker_discovered: false
completed_at: 2026-03-12T00:00:00Z
---

# T01: Scaffold pr-lifecycle extension and write failing tests

**Created pr-lifecycle extension stub and two precisely-failing test files that define the done conditions for T02 and T03.**

## What Happened

1. Created `src/resources/extensions/pr-lifecycle/index.ts` as a no-op default export typed `ExtensionAPI → void`, following the linear extension stub pattern.
2. Created `src/resources/extensions/pr-lifecycle/scripts/.gitkeep` as a placeholder.
3. Wrote `pr-preferences.test.mjs` following the `preferences-frontmatter.test.mjs` pattern: three tests that mock `~/.kata-cli/preferences.md` (via `HOME=tmp`) with a `pr:` YAML block and call `loadEffectiveKataPreferences()`. Two tests fail because `validatePreferences` doesn't yet copy the `pr` field (it returns `undefined`); one test passes because the validation call itself has no errors.
4. Wrote `pr-body-composer.test.ts` with a top-level `await import("../../pr-lifecycle/pr-body-composer.js")` that fails immediately with `ERR_MODULE_NOT_FOUND` until T03 creates the file. Four test cases cover: non-empty string return, `##` heading presence, must-have or task title reference, and different milestone/slice IDs.

**Import path correction:** The task plan specified `../../extensions/pr-lifecycle/pr-body-composer.js` but from `src/resources/extensions/kata/tests/`, that path resolves to `src/resources/extensions/extensions/pr-lifecycle/...` (double `extensions`). The correct relative path is `../../pr-lifecycle/pr-body-composer.js`.

## Verification

- Stub load: `import('./src/resources/extensions/pr-lifecycle/index.ts')` with resolve-ts hook prints `stub loaded` ✓
- `npm test` shows:
  - 87 pass, 3 fail
  - `pr-body-composer.test.ts` fails with `ERR_MODULE_NOT_FOUND: Cannot find module '.../pr-lifecycle/pr-body-composer.ts'` ✓
  - `loadEffectiveKataPreferences reads pr section` fails with `AssertionError: null !== true` ✓
  - `loadEffectiveKataPreferences merges pr section` fails with `AssertionError: null !== true` ✓
  - All 87 existing tests still pass ✓

## Diagnostics

- Run `npm test 2>&1 | grep -E "pr-body|pr-preferences"` to see just the new test failures
- Failures are intentional; they define the contract T02 and T03 must satisfy

## Deviations

- Import path in `pr-body-composer.test.ts` corrected from task plan's `../../extensions/pr-lifecycle/pr-body-composer.js` to `../../pr-lifecycle/pr-body-composer.js`. Task plan had a double `extensions/` segment that would resolve to a wrong path.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/pr-lifecycle/index.ts` — no-op extension stub
- `src/resources/extensions/pr-lifecycle/scripts/.gitkeep` — placeholder for scripts directory
- `src/resources/extensions/kata/tests/pr-preferences.test.mjs` — failing KataPrPreferences schema test
- `src/resources/extensions/kata/tests/pr-body-composer.test.ts` — failing pr-body-composer module test
- `.kata/milestones/M003/slices/S01/S01-PLAN.md` — T01 marked done `[x]`
