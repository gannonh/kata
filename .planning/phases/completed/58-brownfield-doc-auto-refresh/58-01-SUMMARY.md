---
phase: 58-brownfield-doc-auto-refresh
plan: 01
subsystem: codebase-intelligence
tags: [brownfield, staleness-detection, intel]
requires: []
provides: [detectBrownfieldDocStaleness]
affects: [detect-stale-intel.cjs, kata-map-codebase]
tech-stack:
  added: []
  patterns: [brownfield-doc-staleness, analysis-date-parsing, source-file-filtering]
key-files:
  created: []
  modified: [skills/kata-map-codebase/scripts/detect-stale-intel.cjs]
decisions:
  - Used 30% threshold matching existing doc gardening threshold
  - Filters changed files to source extensions only (matching scan-codebase.cjs)
  - First Analysis Date found across brownfield docs wins (ordered priority)
metrics:
  duration: ~2 min
  completed: 2026-02-17
---

# Phase 58 Plan 01: Brownfield Doc Staleness Detection Summary

Extended detect-stale-intel.cjs with detectBrownfieldDocStaleness() that parses Analysis Date from .planning/codebase/ docs, diffs source files against HEAD, and flags staleness at 30% change threshold.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Add SUPPORTED_EXTENSIONS constant and detectBrownfieldDocStaleness function | 8ac5cbd |
| 2 | Integrate brownfield detection into CLI output and exports | ce9626d |

## What Was Built

- `SUPPORTED_EXTENSIONS` constant matching scan-codebase.cjs (12 file extensions)
- `detectBrownfieldDocStaleness(projectRoot)` function with 8-step detection pipeline
- `hasSourceExtension()` helper for filtering git diff output
- CLI output merges brownfield fields into existing JSON result
- Function exported for unit testing

## Brownfield Detection Pipeline

1. Check .planning/codebase/ exists
2. Parse `**Analysis Date:** YYYY-MM-DD` from 7 brownfield docs (first found wins)
3. Find git commit at/before analysis date
4. Diff changed files since that commit
5. Filter to source extensions only
6. Count total source files via git ls-files
7. Compute change percentage
8. Return staleness verdict (>30% = stale)

## Graceful Degradation

- No codebase dir: `{ brownfieldDocStale: false }`
- No Analysis Date found: `{ brownfieldDocStale: false, reason: 'no_analysis_date' }`
- No commit at date: `{ brownfieldDocStale: false, reason: 'no_commit_at_date' }`
- Git diff failure: `{ brownfieldDocStale: false, reason: 'git_diff_failed' }`
- Zero total files: returns 0% change, not stale

## Output Fields

```json
{
  "brownfieldDocStale": true|false,
  "brownfieldAnalysisDate": "YYYY-MM-DD",
  "brownfieldChangedFiles": N,
  "brownfieldTotalFiles": N,
  "brownfieldChangePct": 0.XX
}
```

## Deviations

None.
