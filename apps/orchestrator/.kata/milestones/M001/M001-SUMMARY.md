---
id: M001
provides:
  - Full project rename from get-shit-done/gsd/TÂCHES to kata-orchestrator/kata
  - Statusline hook deleted with no remaining references
  - All 535 tests passing under new identity
  - npm pack tarball clean of gsd/get-shit-done references (excluding CHANGELOG)
  - kata bin entry functional; package.json identity correct
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
  - Package name: kata-orchestrator (D001)
  - Bin command: kata (D002)
  - File prefix: kata- replacing gsd- (D003)
  - Statusline: removed entirely (D004)
  - gsd_state_version renamed to kata_state_version in state.cjs
  - Source dir kata/ installs as kata-orchestrator/ — naming asymmetry is intentional
slices_completed:
  - S01: Rename and strip — 2026-03-13
verification_result: passed
completed_at: 2026-03-13
---

# M001: Rebrand

**All branding replaced, statusline removed, 535 tests green, tarball clean — kata-orchestrator is the new identity.**

## What Shipped

Single slice (S01) executed as one atomic rename sweep:
- Directories: `get-shit-done/` → `kata/`, `commands/gsd/` → `commands/kata/`
- Files: 12 agent files renamed, 2 hooks renamed, statusline hook deleted, hooks/dist rebuilt
- Code: all gsd/get-shit-done/TÂCHES references replaced throughout source, tests, docs, and assets
- package.json: name, bin key, files array, metadata updated
- 535 tests pass; npm pack tarball passes grep cleanliness check

## All Success Criteria Met

- `package.json` name is `kata-orchestrator`, bin entry is `kata` ✓
- Zero occurrences of `gsd` or `get-shit-done` in shipped files (CHANGELOG excluded) ✓
- `gsd-statusline.js` and all references to it are gone ✓
- `npm test` passes (535/535) ✓
- `npm pack` produces a clean tarball with no old identity references ✓

## Requirements Validated

- R001 — Package identity is kata-orchestrator: fully validated
- R002 — Statusline hook removed: fully validated
