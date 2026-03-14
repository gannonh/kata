---
id: S01
parent: M001
milestone: M001
provides:
  - Full project rename from get-shit-done/gsd/TÂCHES to kata-orchestrator/kata
  - Statusline hook deleted; no references remain
  - All 535 tests passing under new identity
  - npm pack tarball clean of gsd/get-shit-done references (excluding CHANGELOG)
  - kata bin entry functional; package.json identity correct
requires: []
affects: []
key_files:
  - package.json
  - bin/install.js
  - kata/bin/kata-tools.cjs
  - kata/bin/lib/state.cjs
  - tests/helpers.cjs
  - scripts/build-hooks.js
  - hooks/dist/kata-check-update.js
  - hooks/dist/kata-context-monitor.js
key_decisions:
  - gsd_state_version field renamed to kata_state_version in state.cjs and matching tests
  - Source dir kata/ maps to installed destination kata-orchestrator/ (npm package name) — bin/install.js uses src/kata as source, targetDir/kata-orchestrator as destination
  - Local variable names in bin/install.js (gsdBlock, gsdDir, gsdHooks, etc.) renamed individually — not caught by word-boundary sed
  - kata/bin/gsd-tools.cjs renamed to kata-tools.cjs — was inside renamed dir, missed by earlier renames
patterns_established:
  - All internal variable names formerly containing gsd renamed to kata* equivalents
  - hooks/dist/ is a build artifact; always rebuilt via npm run build:hooks after hook source changes
observability_surfaces:
  - npm test — 535 tests; any future path breakage surfaces immediately with exact module path
  - rg -l 'gsd|get-shit-done' --glob '!CHANGELOG.md' --glob '!node_modules/**' — zero-result check for surviving references
  - npm pack --dry-run | grep -iE 'gsd|get-shit-done' | grep -v CHANGELOG — tarball cleanliness check
drill_down_paths:
  - .kata/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
duration: ~30min
verification_result: passed
completed_at: 2026-03-13
---

# S01: Rename and Strip

**Full atomic rename sweep: 535 tests green, tarball clean, kata bin functional — project identity is kata-orchestrator.**

## What Happened

Executed a single atomic rename sweep across the entire codebase:

1. Renamed `get-shit-done/` → `kata/` and `commands/gsd/` → `commands/kata/`
2. Renamed 12 `agents/gsd-*.md` files to `agents/kata-*.md`
3. Deleted `hooks/gsd-statusline.js`; renamed the two remaining hooks to `kata-check-update.js` and `kata-context-monitor.js`
4. Mass sed replacement across all .js/.cjs/.mjs/.json/.md/.yaml files: `get-shit-done-cc` → `kata-orchestrator`, `get-shit-done` → `kata-orchestrator`, all `gsd-*` prefixed identifiers → `kata-*`, `TÂCHES` → `kata-orchestrator`, `Kata_CODEX_MARKER` → `KATA_CODEX_MARKER`
5. Updated `package.json`: bin key `kata-orchestrator` → `kata`, files array `kata-orchestrator` → `kata`, metadata cleaned
6. Updated `scripts/build-hooks.js`: statusline entry removed, hook entries updated to `kata-*`
7. Cleared stale `hooks/dist/` and rebuilt via `npm run build:hooks`
8. Fixed residual issues: `kata/bin/gsd-tools.cjs` → `kata-tools.cjs`; local variable renames in `bin/install.js`; `gsd_state_version` → `kata_state_version` in `state.cjs`; `bin/install.js` source path corrected to `src/kata`
9. All 535 tests passed

## Verification

- `npm test` — 535 pass, 0 fail ✓
- `rg -l 'gsd|get-shit-done' --glob '!CHANGELOG.md' --glob '!node_modules/**' --glob '!.kata/**'` — zero results ✓
- `npm pack --dry-run | grep -iE 'gsd|get-shit-done' | grep -v CHANGELOG` — no results ✓
- `ls hooks/dist/` — kata-check-update.js, kata-context-monitor.js only ✓
- `node -e "const p = require('./package.json'); console.assert(p.name === 'kata-orchestrator'); console.assert(p.bin.kata)"` — passes ✓

## Requirements Advanced

- R001 — Package identity fully renamed: package.json, bin entry, all source files, agent files, hook files, command dirs
- R002 — Statusline hook deleted; no remaining references in source or built output

## Requirements Validated

- R001 — Validated: `npm pack` tarball contains zero gsd/get-shit-done references outside CHANGELOG; `npm test` 535/535 green; bin entry `kata` present in package.json
- R002 — Validated: `hooks/gsd-statusline.js` deleted; `ls hooks/ | grep gsd` empty; `npm pack --dry-run` shows no statusline references

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `gsd_state_version` frontmatter field in `kata/bin/lib/state.cjs` renamed to `kata_state_version` — plan's `\bgsd\b` sed would have left the compound `gsd_state_version` broken; renamed consistently with matching test references.
- `bin/install.js` local variable names (`gsdBlock`, `gsdDir`, `gsdHooks`, `gsdPath`, `gsdSrc`, `gsdDest`, `gsdHashes`, `gsdCommandsDir`) not caught by word-boundary sed — renamed individually.
- `kata/bin/gsd-tools.cjs` not caught by earlier renames (file was inside the already-renamed dir) — renamed to `kata-tools.cjs`.
- `tests/helpers.cjs` and `tests/agent-frontmatter.test.cjs` had quoted string `'kata-orchestrator'` not caught by slash-pattern sed — fixed with single-quote-aware sed.

## Known Limitations

- None — this is the only slice in M001; the milestone is complete.

## Follow-ups

- M002 begins: Claude Code Plugin distribution format (R003)

## Files Created/Modified

- `kata/` — renamed from `get-shit-done/`
- `kata/bin/kata-tools.cjs` — renamed from `gsd-tools.cjs`
- `kata/bin/lib/state.cjs` — `gsd_state_version` → `kata_state_version`
- `commands/kata/` — renamed from `commands/gsd/`
- `agents/kata-*.md` — 12 files renamed from `gsd-*.md`
- `hooks/kata-check-update.js` — renamed from `gsd-check-update.js`
- `hooks/kata-context-monitor.js` — renamed from `gsd-context-monitor.js`
- `hooks/gsd-statusline.js` — deleted
- `hooks/dist/kata-check-update.js` — rebuilt
- `hooks/dist/kata-context-monitor.js` — rebuilt
- `package.json` — name, bin, files, description, author updated
- `scripts/build-hooks.js` — statusline removed, hook names updated
- `bin/install.js` — all gsd references replaced; source path corrected; local vars renamed
- `tests/helpers.cjs` — path to kata-tools.cjs updated
- `tests/agent-frontmatter.test.cjs` — workflow paths updated
- `tests/config.test.cjs` — local var renames
- `tests/state.test.cjs` — kata_state_version field references
- All `tests/*.cjs` — require paths updated from `kata-orchestrator/` to `kata/`
- `README.md` — TÂCHES and gsd references updated
- `assets/terminal.svg` — old identity strings updated

## Forward Intelligence

### What the next slice should know
- The installed source directory is `kata/` (not `kata-orchestrator/`) — `bin/install.js` copies from `src/kata` and places into `targetDir/kata-orchestrator`. This naming asymmetry is intentional and tested.
- `hooks/dist/` is always a build artifact — any change to `hooks/kata-*.js` requires `npm run build:hooks` before testing.
- 535 tests are the baseline; any new features should preserve this count or increase it.

### What's fragile
- The `kata/bin/kata-tools.cjs` → `kata/` path mapping — if install.js source path ever drifts from the actual dir name, install silently copies nothing. The test suite catches this but it's easy to miss in reviews.

### Authoritative diagnostics
- `npm test` — first signal for any path or reference breakage; test error messages include exact file path and line
- `rg -l 'gsd|get-shit-done'` — zero-result is the cleanliness invariant; run after any bulk edit

### What assumptions changed
- Assumed word-boundary sed would catch all `gsd` occurrences — it did not catch compound identifiers (`gsd_state_version`), quoted strings in test files, or local variable names in install.js. All fixed manually.
