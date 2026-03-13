---
id: T03
parent: S06
milestone: M002
provides:
  - "src/resources/extensions/kata/tests/linear-auto.test.ts — 22 passing unit tests covering resolveLinearKataState and all selectLinearPrompt dispatch paths"
key_files:
  - src/resources/extensions/kata/tests/linear-auto.test.ts
key_decisions:
  - "resolveLinearKataState blocked paths tested by temporarily writing linear-mode preferences to the project's .kata/preferences.md with backup/restore — cleanest approach since PROJECT_PREFERENCES_PATH is captured at module load time and has no env-var override seam"
patterns_established:
  - "Preferences backup/restore pattern for testing linear-mode code paths: readFileSync backup → writeFileSync override → try/finally restore"
observability_surfaces:
  - "Run `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/kata/tests/linear-auto.test.ts` to verify all 22 S06 routing assertions pass"
duration: 20m
verification_result: passed
completed_at: 2026-03-12
blocker_discovered: false
---

# T03: Unit tests for Linear auto routing + full test suite + TypeScript clean

**22 passing unit tests written for `linear-auto.ts`; full suite 86 pass / 0 fail; TypeScript clean.**

## What Happened

`linear-auto.test.ts` already existed from a prior partial session with 20 tests covering `selectLinearPrompt` and the 4 prompt builders, but it explicitly skipped `resolveLinearKataState` ("requires Linear API network access"). That comment was incorrect — the blocked paths (missing API key, file-mode fallback) return before any network call.

Added 2 new tests:

1. **`resolveLinearKataState returns blocked when LINEAR_API_KEY is not set`** — temporarily writes a minimal linear-mode preferences override to `.kata/preferences.md` so `isLinearMode()` returns `true`, unsets `LINEAR_API_KEY`, calls `resolveLinearKataState("/tmp")`, and asserts `phase === "blocked"` with a blocker message containing "LINEAR_API_KEY". Backup/restore via try/finally ensures the project preferences are never permanently modified.

2. **`resolveLinearKataState falls back to deriveState in file mode`** — with the project's normal (non-linear) preferences, calls `resolveLinearKataState(tmpDir)` and asserts `phase === "pre-planning"` and `activeMilestone === null` — the expected output of `deriveState` on an empty directory.

Also updated the file header comment and imports to reflect that `resolveLinearKataState` is now tested.

## Verification

```
# New linear-auto tests (22 tests)
node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
  --experimental-strip-types --test \
  src/resources/extensions/kata/tests/linear-auto.test.ts
→ 22 pass, 0 fail

# Full suite
npm test
→ 86 pass, 0 fail

# TypeScript
npx tsc --noEmit
→ no output (clean)

# Line count
wc -l src/resources/extensions/kata/tests/linear-auto.test.ts
→ 255 lines
```

## Diagnostics

`linear-auto.test.ts` is the canonical regression proof for S06 routing. The 2 `resolveLinearKataState` tests and 20 `selectLinearPrompt` / builder tests together cover every phase, every null-return path, and every prompt builder's content.

## Deviations

The test file existed before this task with 20 tests; only 2 tests and updated imports/header were added rather than writing the file from scratch. The backup/restore approach for testing linear-mode preferences was chosen because `PROJECT_PREFERENCES_PATH` is captured at module load time in `preferences.ts`, making process.chdir() or env-var injection ineffective. Writing to the actual file and restoring it in try/finally is the only reliable approach without adding a mock seam to the production code.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/kata/tests/linear-auto.test.ts` — added 2 `resolveLinearKataState` tests, updated header and imports (22 total tests)
