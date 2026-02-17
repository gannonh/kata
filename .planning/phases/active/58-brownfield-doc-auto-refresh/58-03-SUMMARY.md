---
phase: 58-brownfield-doc-auto-refresh
plan: 03
status: complete
started: 2026-02-17T17:06:18Z
completed: 2026-02-17T17:09:14Z
duration: ~3 min
tasks_completed: 3
tasks_total: 3
files_modified:
  - skills/kata-execute-phase/SKILL.md
commits:
  - 5ad79e0 feat(58-03): parse brownfield staleness fields from detect-stale-intel.cjs
  - 0ef257b feat(58-03): add brownfield auto-refresh path with mapper agent spawning
  - 0c48364 docs(58-03): add mapper agent row to model lookup table
---

# 58-03 Summary: Brownfield Auto-Refresh Integration

## What Changed

Integrated brownfield doc auto-refresh into `kata-execute-phase` SKILL.md step 7.25. When `detect-stale-intel.cjs` reports `brownfieldDocStale: true`, the orchestrator now spawns 4 mapper agents (matching `/kata-map-codebase` behavior), runs `generate-intel.js`, then runs `scan-codebase.cjs` to refresh stale brownfield documentation automatically.

## Key Changes

1. **Widened step 7.25 gate** from `index.json` only to `index.json OR .planning/codebase/` directory, covering brownfield-mapped projects where intel was never generated.

2. **Added brownfield staleness field parsing** using `node -e` JSON parsing (not grep) for reliable boolean extraction of `brownfieldDocStale` and `brownfieldAnalysisDate`.

3. **Added brownfield auto-refresh path** that spawns 4 parallel mapper agents via Task() with inlined instructions from `codebase-mapper-instructions.md`, then runs generate-intel.js and scan-codebase.cjs.

4. **Guarded TOTAL_FILES computation** with try/catch defaulting to 0 when index.json is absent.

5. **Guarded scan decision tree** with `SCAN_RAN != "true"` to skip when auto-refresh already completed.

6. **Guarded doc gardening warning** with `BROWNFIELD_STALE != "true"` to avoid redundant warning after auto-refresh.

7. **Added mapper agent row** to model lookup table (haiku for all profiles).

## Verification

- All 44 build/validation tests pass after each task
- Gate condition covers both index.json and .planning/codebase/ directory
- BROWNFIELD_STALE initialized to "false" before JSON parsing
- All auto-refresh operations use `|| true` (non-blocking)
- SCAN_RAN=true prevents duplicate scanning
- Existing scan paths (greenfield, staleness, incremental) unchanged when brownfieldDocStale=false
