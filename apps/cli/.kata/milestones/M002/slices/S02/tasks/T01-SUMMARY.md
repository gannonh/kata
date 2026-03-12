---
id: T01
parent: S02
milestone: M002
provides:
  - Workflow/Linear preference schema, canonical project preference path, and parser compatibility coverage
key_files:
  - src/resources/extensions/kata/preferences.ts
  - src/resources/extensions/kata/gitignore.ts
  - src/resources/extensions/kata/templates/preferences.md
  - src/resources/extensions/kata/docs/preferences-reference.md
  - src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs
key_decisions:
  - Reused `.kata/preferences.md` as the canonical project config file while keeping `.kata/PREFERENCES.md` as a read-only compatibility fallback
patterns_established:
  - Normalize nested frontmatter into typed preference sections before callers consume it
  - Prefer lowercase canonical config filenames for new bootstrapped Kata project files
observability_surfaces:
  - `loadProjectKataPreferences()` now exposes which project preference filename was actually loaded
  - `preferences-frontmatter.test.mjs` proves nested workflow/linear parsing plus lowercase/uppercase filename compatibility
duration: 1h
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T01: Extend project preferences for workflow mode and Linear binding

**Added typed workflow/Linear preference fields, canonical lowercase project preference bootstrapping, and regression coverage for filename compatibility and nested frontmatter parsing.**

## What Happened

Updated `src/resources/extensions/kata/preferences.ts` so `KataPreferences` can represent `workflow.mode` (`file` | `linear`) and the Linear binding fields `linear.teamId`, `linear.teamKey`, and `linear.projectId`.

Project preference loading now prefers `.kata/preferences.md` and falls back to legacy `.kata/PREFERENCES.md`. The loader also validates/normalizes parsed frontmatter before returning it, so `workflow.mode: LINEAR` becomes `linear` for downstream code.

Updated `src/resources/extensions/kata/gitignore.ts` and `src/resources/extensions/kata/templates/preferences.md` so newly bootstrapped projects create the canonical lowercase preference file and show the new `workflow` + `linear` config shape. Updated `src/resources/extensions/kata/docs/preferences-reference.md` to document allowed values, the Linear binding fields, the lowercase canonical path, and the rule that secrets stay in env vars rather than preferences.

Expanded `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` to cover nested workflow/linear parsing, canonical-vs-legacy filename precedence, legacy uppercase fallback, and lowercase bootstrap behavior.

## Verification

- Passed: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs`
- Passed: `npx tsc --noEmit`
- Manual schema/doc check: confirmed the template and reference doc both describe `workflow.mode`, `linear.teamId`, `linear.teamKey`, and `linear.projectId`, and they explicitly keep secrets like `LINEAR_API_KEY` out of preferences.

Slice-level verification status after T01:
- Not run yet: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs src/resources/extensions/kata/tests/linear-config.test.ts src/resources/extensions/kata/tests/mode-switching.test.ts` (later-task test files do not exist yet)
- Not run yet: `LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-config.integration.test.ts` (T02 not implemented yet)
- Not run yet: `/kata prefs status` verification (T03 not implemented yet)

## Diagnostics

- Inspect `src/resources/extensions/kata/preferences.ts` to see the exact supported typed fields and the canonical/legacy project filename resolution order.
- Inspect `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` for executable examples of accepted nested frontmatter and fallback behavior.
- Inspect `src/resources/extensions/kata/templates/preferences.md` for the user-facing bootstrap shape that new projects receive.

## Deviations

- Added `npx tsc --noEmit` verification in this task even though the task-level verify command only required the parser tests, to ensure the new preference types and normalization changes remained type-safe.

## Known Issues

- `commands.ts` still creates project preferences via the canonical lowercase path string, but `/kata prefs status` and centralized Linear mode helpers are not implemented until T02/T03.
- Slice-wide mode detection and live Linear validation are still pending later tasks.

## Files Created/Modified

- `src/resources/extensions/kata/preferences.ts` — added typed workflow/linear preferences, normalized loading, and canonical/legacy project preference path resolution
- `src/resources/extensions/kata/gitignore.ts` — switched bootstrap output to `.kata/preferences.md` and updated the embedded template text
- `src/resources/extensions/kata/templates/preferences.md` — documented workflow mode, Linear config block, and env-var secret handling
- `src/resources/extensions/kata/docs/preferences-reference.md` — documented the new schema fields, allowed values, canonical filename, and secret-storage guidance
- `src/resources/extensions/kata/tests/preferences-frontmatter.test.mjs` — added regression coverage for nested workflow/linear parsing and lowercase/uppercase filename compatibility
