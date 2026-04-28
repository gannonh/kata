---
id: T01
parent: S01
milestone: M001
provides:
  - Full project rename from get-shit-done/gsd/TÂCHES to kata-orchestrator/kata
  - Statusline hook removed
  - All 535 tests passing under new identity
key_files:
  - kata/bin/kata-tools.cjs
  - kata/bin/lib/state.cjs
  - bin/install.js
  - tests/helpers.cjs
  - package.json
  - scripts/build-hooks.js
  - hooks/dist/kata-check-update.js
  - hooks/dist/kata-context-monitor.js
key_decisions:
  - gsd_state_version field renamed to kata_state_version in state.cjs and matching tests
  - Source dir `kata/` maps to installed destination `kata-orchestrator/` (the npm package name) — bin/install.js uses src/kata as source, targetDir/kata-orchestrator as destination
patterns_established:
  - All internal variable names formerly containing gsd (gsdBlock, gsdDir, gsdHooks, gsdPath, gsdSrc, gsdDest) renamed to kata* equivalents
observability_surfaces:
  - npm test — 535 tests; any future path breakage surfaces immediately with exact module path
  - rg -l 'gsd|get-shit-done' to check for surviving references
duration: ~30min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Rename directories, files, and all string references; remove statusline

**Swept the entire project from get-shit-done/gsd/TÂCHES identity to kata-orchestrator/kata; 535 tests pass, npm pack clean.**

## What Happened

Executed the full atomic rename sweep in sequence:

1. Renamed `get-shit-done/` → `kata/`, `commands/gsd/` → `commands/kata/`
2. Renamed all `agents/gsd-*.md` → `agents/kata-*.md` (12 files)
3. Deleted `hooks/gsd-statusline.js`; renamed remaining two hooks to `kata-check-update.js` and `kata-context-monitor.js`
4. Mass sed replacement across all .js/.cjs/.mjs/.json/.md/.yaml files: `get-shit-done-cc` → `kata-orchestrator`, `get-shit-done` → `kata-orchestrator`, `gsd-tools` → `kata-tools`, `gsd-check-update` → `kata-check-update`, `gsd-context-monitor` → `kata-context-monitor`, `\bgsd\b` → `kata`, `TÂCHES` → `kata-orchestrator`, `Kata_CODEX_MARKER` → `KATA_CODEX_MARKER`
5. Updated `package.json`: bin key `kata-orchestrator` → `kata`, files array `kata-orchestrator` → `kata`, removed TÂCHES from description/author
6. Updated `scripts/build-hooks.js`: removed statusline entry, renamed hooks to `kata-*`
7. Rebuilt `hooks/dist/` via `npm run build:hooks`
8. Fixed residual issues: `kata/bin/gsd-tools.cjs` → `kata/bin/kata-tools.cjs`; local variable renames in `bin/install.js` (`gsdBlock`, `gsdDir`, etc.); test file path references; `kata_state_version` field rename in `state.cjs`; `bin/install.js` source path `src/kata-orchestrator` → `src/kata` for the skill copy step
9. All 535 tests passed

## Verification

- `npm test` — 535 pass, 0 fail ✓
- `rg -l 'gsd|get-shit-done'` (excluding CHANGELOG, node_modules, .git, .kata) — no results ✓
- `ls agents/ | grep gsd` — empty ✓
- `ls hooks/ | grep gsd` — empty ✓
- `node -e "...console.assert(p.name === 'kata-orchestrator'); console.assert(p.bin.kata)"` — OK ✓
- `npm pack --dry-run | grep -iE 'gsd|get-shit-done' | grep -v CHANGELOG` — no results ✓
- `ls hooks/dist/` — kata-check-update.js, kata-context-monitor.js (no gsd-* files) ✓

## Diagnostics

- `rg -l 'gsd|get-shit-done' --glob '!CHANGELOG.md' --glob '!node_modules/**'` — zero results means clean
- `npm test` — test failure messages include exact file path and line for any broken require
- `node -e "require('./package.json')"` — metadata check

## Deviations

- `gsd_state_version` frontmatter field (in `kata/bin/lib/state.cjs`) renamed to `kata_state_version` — plan said to replace `\bgsd\b` which would have left the compound `gsd_state_version` broken; renamed consistently.
- `bin/install.js` contained local variable names (`gsdBlock`, `gsdDir`, `gsdHooks`, `gsdPath`, `gsdSrc`, `gsdDest`, `gsdHashes`, `gsdCommandsDir`) not caught by word-boundary sed — renamed individually.
- `kata/bin/gsd-tools.cjs` not caught by earlier renames (was inside renamed dir) — renamed to `kata-tools.cjs`.
- `tests/helpers.cjs` and `tests/agent-frontmatter.test.cjs` had quoted string `'kata-orchestrator'` not caught by slash-pattern sed — fixed with single-quote-aware sed.

## Known Issues

None.

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
- `tests/agent-frontmatter.test.cjs` — path to workflows updated
- `tests/config.test.cjs` — local var renames
- `tests/state.test.cjs` — kata_state_version field references
- All `tests/*.cjs` — require paths updated from `kata-orchestrator/` to `kata/`
- `README.md` — TÂCHES and gsd references updated
- `assets/terminal.svg` — old identity strings updated
