---
estimated_steps: 10
estimated_files: 30+
---

# T01: Rename directories, files, and all string references; remove statusline

**Slice:** S01 — Rename and Strip
**Milestone:** M001

## Description

Atomic rename sweep converting the entire project from `get-shit-done`/`gsd`/`TÂCHES` branding to `kata-orchestrator`/`kata`. This includes: renaming the `get-shit-done/` source directory to `kata/`, renaming `commands/gsd/` to `commands/kata/`, renaming all `agents/gsd-*.md` to `agents/kata-*.md`, deleting `hooks/gsd-statusline.js` and renaming the remaining two hooks, updating all internal string references across every non-CHANGELOG source file, updating `package.json` metadata, updating `scripts/build-hooks.js` to remove statusline and use new filenames, rebuilding `hooks/dist/`, and verifying `npm test` + `npm pack` are clean.

All steps execute in sequence in a single context window. Partial completion is not a valid stopping point — the sweep must finish with tests passing.

## Steps

1. Rename main source directory: `mv get-shit-done kata`
2. Rename commands directory: `mv commands/gsd commands/kata`
3. Rename agent files: `for f in agents/gsd-*.md; do mv "$f" "agents/kata-${f#agents/gsd-}"; done`
4. Remove statusline hook: `rm hooks/gsd-statusline.js`
5. Rename remaining hooks: `mv hooks/gsd-check-update.js hooks/kata-check-update.js && mv hooks/gsd-context-monitor.js hooks/kata-context-monitor.js`
6. Mass string replacement via `find` + `sed -i ''` across all `.js`, `.cjs`, `.mjs`, `.json`, `.md`, `.yaml`, `.yml` files (excluding `node_modules`, `.git`, `CHANGELOG.md`): replace `get-shit-done-cc` → `kata-orchestrator`, `get-shit-done` → `kata-orchestrator`, `gsd-tools` → `kata-tools`, `gsd-check-update` → `kata-check-update`, `gsd-context-monitor` → `kata-context-monitor`, `gsd-statusline` → remove references, `\bgsd\b` → `kata`, `TÂCHES` → `kata-orchestrator`, `GSD_CODEX_MARKER` → `KATA_CODEX_MARKER`
7. Manually verify and update `package.json`: name, bin key (`get-shit-done-cc` → `kata`), files array entries, description, author, repository, homepage, bugs URLs
8. Verify and update `scripts/build-hooks.js`: remove `gsd-statusline.js` entry from `HOOKS_TO_COPY`; confirm remaining entries reference `kata-check-update` and `kata-context-monitor`
9. Delete stale build output and rebuild: `rm -rf hooks/dist/ && npm run build:hooks`
10. Run `npm test`; if failures occur, inspect error messages for missed references and fix them; repeat until all tests pass

## Must-Haves

- [ ] `get-shit-done/` directory no longer exists; `kata/` directory exists with equivalent contents
- [ ] `commands/gsd/` no longer exists; `commands/kata/` exists
- [ ] No `agents/gsd-*.md` files remain; all are `agents/kata-*.md`
- [ ] `hooks/gsd-statusline.js` is deleted
- [ ] `hooks/gsd-check-update.js` and `hooks/gsd-context-monitor.js` are renamed to `kata-*`
- [ ] `package.json` name is `kata-orchestrator`, bin key is `kata`
- [ ] `scripts/build-hooks.js` has no `gsd-statusline` entry; hook filenames use `kata-` prefix
- [ ] `hooks/dist/` contains `kata-check-update.js` and `kata-context-monitor.js` (no `gsd-*` files)
- [ ] `npm test` exits 0
- [ ] `npm pack --dry-run` tarball contains no `gsd` or `get-shit-done` references (excluding CHANGELOG)

## Verification

- `npm test` — must exit 0, all tests pass
- `rg -l 'gsd|get-shit-done' --glob '!CHANGELOG.md' --glob '!node_modules/**' --glob '!.git/**' --glob '!.kata/**' .` — must return no results in shipped source files
- `ls agents/ | grep gsd` — must return nothing
- `ls hooks/ | grep gsd` — must return nothing
- `node -e "const p = require('./package.json'); console.assert(p.name === 'kata-orchestrator'); console.assert(p.bin.kata); console.log('package.json OK')"` 
- `npm pack --dry-run 2>&1 | grep -iE 'gsd|get-shit-done' | grep -v CHANGELOG && echo "FAIL" || echo "PASS"`

## Observability Impact

- Signals added/changed: `npm test` output is the primary runtime signal — test failures immediately identify any broken path reference by file and line
- How a future agent inspects this: `rg -l 'gsd|get-shit-done'` for surviving references; `tar -tzf` on the packed tarball; `node -e "require('./package.json')"` for package metadata
- Failure state exposed: `npm test` stderr/stdout contains exact failing test and expected vs actual path; `npm pack` output shows which files are included

## Inputs

- `get-shit-done/` — existing source directory to rename
- `commands/gsd/` — existing commands directory to rename
- `agents/gsd-*.md` — existing agent files to rename
- `hooks/gsd-*.js` — existing hook files to rename/delete
- `package.json` — current metadata to update
- `scripts/build-hooks.js` — build script to update
- `bin/install.js` — ~134 gsd occurrences; requires thorough sed pass
- `tests/helpers.cjs` — exports `runGsdTools()` with hardcoded path to `get-shit-done/bin/gsd-tools.cjs`; both function name and path must update
- S01-RESEARCH.md — complete list of affected files and patterns

## Expected Output

- `kata/` source directory (renamed from `get-shit-done/`)
- `commands/kata/` directory (renamed from `commands/gsd/`)
- `agents/kata-*.md` files (renamed from `gsd-*`)
- `hooks/kata-check-update.js`, `hooks/kata-context-monitor.js` (renamed); `hooks/gsd-statusline.js` deleted
- `hooks/dist/kata-check-update.js`, `hooks/dist/kata-context-monitor.js` (rebuilt; no gsd-* files)
- `package.json` with name `kata-orchestrator`, bin `kata`
- All source files with zero `gsd`/`get-shit-done`/`TÂCHES` references
- `npm test` passing (535+ tests)
- `npm pack` tarball with no old identity strings (excluding CHANGELOG)
