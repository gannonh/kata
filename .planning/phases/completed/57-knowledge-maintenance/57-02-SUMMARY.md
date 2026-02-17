---
phase: 57-knowledge-maintenance
plan: 02
subsystem: orchestrator-integration
tags: [staleness-detection, convention-enforcement, doc-gardening, smart-scan]
requires: [57-01-staleness-scripts]
provides: [integrated-staleness-gate, convention-check-gate, doc-gardening-trigger]
affects: []
tech-stack:
  added: []
  patterns: [pre-gate-staleness-check, post-scan-convention-enforcement]
key-files:
  created: []
  modified:
    - skills/kata-execute-phase/SKILL.md
decisions:
  - Staleness detection runs BEFORE greenfield gate (catches stale intel before any scan decision)
  - Convention check runs AFTER summary update (uses complete intel state)
  - Used node -e for stalePct > 0.3 comparison (avoids bc dependency issues on macOS)
  - PHASE_START_COMMIT reused from greenfield gate for convention check (${PHASE_START_COMMIT:-...} fallback)
  - Convention violations parsed via piped node -e (robust JSON extraction vs grep)
metrics:
  duration: 2m
  completed: 2026-02-16
---

# Phase 57 Plan 02: Orchestrator Integration Summary

Staleness detection, doc gardening triggers, and convention enforcement integrated into kata-execute-phase step 7.25 with four-step ordering and non-blocking error handling

## What Was Built

Enhanced step 7.25 in `skills/kata-execute-phase/SKILL.md` with four sequential stages:

**Step 1 (MAINT-01): Staleness detection** runs detect-stale-intel.cjs before the greenfield gate. When stale files are found (`staleCount > 0`), triggers an incremental re-scan using `scan-codebase.cjs --incremental --since $OLDEST_COMMIT`. This ensures stale intel gets refreshed before any scan-mode decision.

**Step 1b (MAINT-02): Doc gardening trigger** checks whether `.planning/codebase/` exists and `stalePct > 0.3`. When both conditions are true, logs a warning recommending `/kata-map-codebase` to refresh brownfield codebase knowledge docs.

**Step 2: Greenfield gate** preserves the existing logic unchanged. TOTAL_FILES check determines full scan (greenfield, totalFiles=0) vs incremental scan (existing codebase, uses PHASE_START_COMMIT).

**Step 3: Summary update** regenerates `.planning/intel/summary.md` via update-intel-summary.cjs. Runs after both staleness-triggered and gate-triggered scans, so summary always reflects the latest scan data.

**Step 4 (MAINT-03): Convention enforcement** runs check-conventions.cjs against files changed during the phase (`PHASE_START_COMMIT..HEAD`). Violations are logged as warnings with file, export, found style, and expected style. Never blocks phase completion.

All new operations use `|| true` or `2>/dev/null` for non-blocking behavior.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Integrate staleness detection and convention checking into step 7.25 | 58929f1 | skills/kata-execute-phase/SKILL.md |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced bc -l with node -e for stalePct comparison**

- **Found during:** Task 1 implementation
- **Issue:** The plan specified `echo "$STALE_PCT > 0.3" | bc -l` for the doc gardening threshold check. `bc` may not be available or behave consistently across macOS/Linux. Node.js is a guaranteed dependency.
- **Fix:** Used `node -e "console.log(Number('${STALE_PCT}') > 0.3 ? 'yes' : 'no')"` instead
- **Files modified:** skills/kata-execute-phase/SKILL.md
- **Commit:** 58929f1

**2. [Rule 1 - Bug] Used node -e for JSON violation parsing instead of grep chains**

- **Found during:** Task 1 implementation
- **Issue:** The plan used grep-based JSON parsing for convention violations (`grep -o '"violations"...' | wc -l`). This is fragile with multiline JSON and whitespace variations. Convention violations contain nested objects that grep struggles with.
- **Fix:** Used piped `node -e` for both violation counting and display, providing robust JSON parsing
- **Files modified:** skills/kata-execute-phase/SKILL.md
- **Commit:** 58929f1

**3. [Rule 3 - Blocking] Added PHASE_START_COMMIT fallback for convention check**

- **Found during:** Task 1 implementation
- **Issue:** Convention check (Step 4) needs PHASE_START_COMMIT, but that variable is only set inside the greenfield gate (Step 2) when TOTAL_FILES > 0. If the greenfield path runs (TOTAL_FILES=0), PHASE_START_COMMIT is unset.
- **Fix:** Added `${PHASE_START_COMMIT:-$(git log ...)}` fallback assignment before the convention check
- **Files modified:** skills/kata-execute-phase/SKILL.md
- **Commit:** 58929f1

## Decisions Made

1. **Node.js over bc for numeric comparison** -- bc is not a guaranteed dependency. Node.js is always available (Claude Code CLI prerequisite). Using node -e for the stalePct > 0.3 comparison.
2. **Node.js piped parsing for violation display** -- Robust JSON handling instead of grep-based extraction for convention violation reporting.
3. **PHASE_START_COMMIT fallback** -- Convention check uses `${PHASE_START_COMMIT:-...}` to handle both greenfield and brownfield paths.

## Verification Results

- detect-stale-intel.cjs syntax check: PASS
- check-conventions.cjs syntax check: PASS
- Step 7.25 references detect-stale-intel.cjs: PASS
- Step 7.25 references check-conventions.cjs: PASS
- Staleness detection before greenfield gate (line ordering): PASS
- Convention check after summary update (line ordering): PASS
- All invocations non-blocking (|| true or || echo): PASS
- Build: PASS (npm run build:plugin)
- Tests: PASS (44/44)

## Next Phase Readiness

Phase 57 is complete. Both plans delivered:
- Plan 01: detect-stale-intel.cjs and check-conventions.cjs scripts
- Plan 02: Integration into kata-execute-phase step 7.25

The knowledge maintenance pipeline is operational: staleness detection triggers incremental re-scans, doc gardening warns when brownfield docs are stale, and convention enforcement logs violations after each phase.
