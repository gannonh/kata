# S01: Rename and Strip

**Goal:** Rename the entire project from get-shit-done/gsd/TÂCHES to kata-orchestrator/kata, remove the statusline feature, and produce a clean npm package under the new identity.
**Demo:** `npm test` passes with 535+ tests green; `npm pack` produces a tarball with no `gsd` or `get-shit-done` references (excluding CHANGELOG); `kata` bin entry is functional.

## Must-Haves

- `package.json` name is `kata-orchestrator`, bin entry is `kata`
- `get-shit-done/` directory renamed to `kata/`; `commands/gsd/` renamed to `commands/kata/`
- `agents/gsd-*.md` files renamed to `agents/kata-*.md`
- `hooks/gsd-statusline.js` deleted; remaining hooks renamed `hooks/kata-*.js`
- `scripts/build-hooks.js` updated: statusline removed, hook filenames updated
- All internal string references to `gsd`, `get-shit-done`, `TÂCHES` replaced throughout source files
- `npm test` passes (535+ tests)
- `npm pack --dry-run` tarball contains zero `gsd`/`get-shit-done` references (excluding CHANGELOG)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (`npm test`, `npm pack`)
- Human/UAT required: no

## Verification

- `npm test` — all tests pass
- `npm pack --dry-run 2>&1 | head -60` — inspect file list for old names
- `npm pack && tar -tzf kata-orchestrator-*.tgz | grep -v CHANGELOG | grep -iE 'gsd|get-shit-done' && echo "FAIL: old names found" || echo "PASS: no old names in tarball"`
- `rm -f kata-orchestrator-*.tgz`

## Observability / Diagnostics

- Runtime signals: `npm test` output is the primary signal — test failures surface broken path references immediately
- Inspection surfaces: `rg -l 'gsd|get-shit-done' --type=md --type=js --type=cjs --type=json` to find surviving references; `tar -tzf` + `grep` on packed tarball
- Failure visibility: `npm test` exit code; grep against packed tarball; test error messages identify the exact broken import path
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `get-shit-done/` source directory, `commands/gsd/`, `agents/gsd-*`, `hooks/gsd-*`, `bin/install.js`, `tests/helpers.cjs`, `scripts/build-hooks.js`, `package.json`
- New wiring introduced in this slice: `kata/` source directory, `kata` bin entry, `kata-*` agent/hook filenames, updated `tests/helpers.cjs` path
- What remains before the milestone is truly usable end-to-end: nothing — S01 is the only slice

## Tasks

- [x] **T01: Rename directories, files, and all string references; remove statusline** `est:2h`
  - Why: The entire rename is one atomic sweep — partial state would break tests. All four categories (directory rename, file rename, string replacement, deletion) must happen together.
  - Files: `get-shit-done/` → `kata/`, `commands/gsd/` → `commands/kata/`, `agents/gsd-*.md` → `agents/kata-*.md`, `hooks/gsd-check-update.js` → `hooks/kata-check-update.js`, `hooks/gsd-context-monitor.js` → `hooks/kata-context-monitor.js`, `hooks/gsd-statusline.js` (delete), `scripts/build-hooks.js`, `package.json`, `bin/install.js`, `tests/helpers.cjs`, `README.md`, all source files with gsd/get-shit-done/TÂCHES references
  - Do:
    1. `mv get-shit-done kata` — rename main source directory
    2. `mv commands/gsd commands/kata` — rename commands directory
    3. Rename each `agents/gsd-*.md` → `agents/kata-*.md`
    4. `rm hooks/gsd-statusline.js`; `mv hooks/gsd-check-update.js hooks/kata-check-update.js`; `mv hooks/gsd-context-monitor.js hooks/kata-context-monitor.js`
    5. Run `find . -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name 'CHANGELOG.md' -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' -o -name '*.json' -o -name '*.md' -o -name '*.yaml' -o -name '*.yml' \) | xargs sed -i '' -e 's/get-shit-done-cc/kata-orchestrator/g' -e 's/get-shit-done/kata-orchestrator/g' -e 's/gsd-tools/kata-tools/g' -e 's/gsd-check-update/kata-check-update/g' -e 's/gsd-context-monitor/kata-context-monitor/g' -e 's/gsd-statusline/DELETED/g' -e 's/\bgsd\b/kata/g' -e 's/TÂCHES/kata-orchestrator/g' -e 's/Kata_CODEX_MARKER/KATA_CODEX_MARKER/g'`
    6. Update `package.json`: name → `kata-orchestrator`, bin key → `kata`, files array `get-shit-done` → `kata`, commands/gsd references → commands/kata; update description, author, repository, homepage, bugs URLs
    7. Update `scripts/build-hooks.js`: remove `gsd-statusline.js` from `HOOKS_TO_COPY`; ensure remaining entries use `kata-` filenames
    8. `rm -rf hooks/dist/` — clear stale build output
    9. `npm run build:hooks` — rebuild hooks/dist with new filenames
    10. Run `npm test` — fix any failures from missed references
  - Verify: `npm test` exits 0; `rg -l 'gsd|get-shit-done' --type=js --type=cjs --type=json --type=md -g '!CHANGELOG.md' -g '!node_modules' | grep -v '.kata/'` returns no results (or only acceptable non-shipped files); `npm pack --dry-run` shows `kata-orchestrator-*.tgz` with no old names in file list
  - Done when: `npm test` passes AND tarball grep for `gsd`/`get-shit-done` (excluding CHANGELOG) is empty

## Files Likely Touched

- `package.json`
- `bin/install.js`
- `scripts/build-hooks.js`
- `tests/helpers.cjs`
- `README.md`
- `get-shit-done/` → `kata/` (entire directory)
- `commands/gsd/` → `commands/kata/` (entire directory)
- `agents/gsd-*.md` (all agent files)
- `hooks/gsd-check-update.js` → `hooks/kata-check-update.js`
- `hooks/gsd-context-monitor.js` → `hooks/kata-context-monitor.js`
- `hooks/gsd-statusline.js` (deleted)
- `hooks/dist/` (rebuilt)
- All `.md`, `.js`, `.cjs`, `.json` files containing `gsd`/`get-shit-done`/`TÂCHES`
