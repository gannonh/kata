# S01: Rename and Strip — UAT

**Milestone:** M001
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All acceptance criteria are mechanically verifiable — test suite output, tarball inspection, and filesystem state confirm the rename is complete and clean. No user-visible UI or human-experience judgement is required for this slice.

## Preconditions

- Node.js installed, `npm` available
- Working directory is project root
- `node_modules` is installed (`npm install` if not)

## Smoke Test

```bash
node -e "const p = require('./package.json'); console.assert(p.name === 'kata-orchestrator', 'wrong name'); console.assert(p.bin && p.bin.kata, 'missing kata bin'); console.log('OK: kata-orchestrator / kata bin');"
```

Expected: prints `OK: kata-orchestrator / kata bin` with no assertion errors.

## Test Cases

### 1. npm test passes

```bash
npm test
```

**Expected:** All 535 tests pass, 0 failures. Final lines show `pass 535` and `fail 0`.

### 2. No old identity references in source

```bash
rg -l 'gsd|get-shit-done' \
  --glob '!CHANGELOG.md' \
  --glob '!node_modules/**' \
  --glob '!.git/**' \
  --glob '!.kata/**' \
  && echo "FAIL: references found" || echo "PASS: clean"
```

**Expected:** prints `PASS: clean` — no matching files.

### 3. npm pack tarball is clean

```bash
npm pack --dry-run 2>&1 | grep -iE 'gsd|get-shit-done' | grep -v CHANGELOG \
  && echo "FAIL: old names in tarball" || echo "PASS: tarball clean"
```

**Expected:** prints `PASS: tarball clean`.

### 4. hooks/dist contains only kata-prefixed files

```bash
ls hooks/dist/
```

**Expected:** `kata-check-update.js` and `kata-context-monitor.js` — no `gsd-*` files.

### 5. Statusline hook is gone

```bash
ls hooks/ | grep gsd && echo "FAIL: gsd hooks present" || echo "PASS: no gsd hooks"
ls hooks/dist/ | grep gsd && echo "FAIL: gsd in dist" || echo "PASS: dist clean"
```

**Expected:** both lines print `PASS`.

## Edge Cases

### CHANGELOG preserves original attribution

```bash
grep -c 'get-shit-done\|gsd' CHANGELOG.md
```

**Expected:** non-zero count — CHANGELOG intentionally retains original names for historical context. This is correct behavior.

### agents/ directory contains only kata-prefixed files

```bash
ls agents/ | grep '^gsd' && echo "FAIL" || echo "PASS: no gsd-* agents"
```

**Expected:** `PASS: no gsd-* agents`.

## Failure Signals

- `npm test` exits non-zero or shows `fail N` — a path reference or require() was not updated
- `rg` returns file paths — surviving old-identity strings in source
- `ls hooks/dist/` shows `gsd-*` files — hooks/dist was not rebuilt after rename
- `package.json` still has `bin.gsd` or `name: get-shit-done` — package.json update was not applied
- `npm pack --dry-run` shows old names — a shipped file was not updated

## Requirements Proved By This UAT

- R001 — Package identity is kata-orchestrator: proven by package.json assertions (name, bin), `npm test` passing (all internal paths use new identity), and tarball inspection (no old names in shipped files)
- R002 — Statusline hook removed: proven by `ls hooks/ | grep gsd` returning empty and `hooks/dist/` containing only `kata-*` files

## Not Proven By This UAT

- Live install: this UAT does not execute `npm install -g kata-orchestrator` or run `kata` as an installed binary end-to-end. The bin entry is structurally verified but not exercised in a real user shell.
- Claude Code Plugin validity (R003): not in scope for M001 — distribution format work begins in M002.
- Codex/Cursor/Agent Skills distribution formats (R004, R005, R006): deferred to M003–M005.
- Multi-version build system (R007): deferred to M002.

## Notes for Tester

- CHANGELOG.md intentionally retains `get-shit-done` and `gsd` strings — do not flag these as failures.
- The `.kata/` directory also intentionally retains old-identity strings in planning artifacts (roadmap, task summaries) — these are not shipped files.
- `npm test` takes ~50 seconds on first run; this is normal.
