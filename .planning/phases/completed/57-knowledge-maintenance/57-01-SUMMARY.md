---
phase: 57-knowledge-maintenance
plan: 01
subsystem: intel-pipeline
tags: [staleness-detection, convention-enforcement, codebase-intelligence]
requires: [55-codebase-capture, 56-greenfield-integration]
provides: [detect-stale-intel-script, check-conventions-script]
affects: [57-02-orchestrator-integration]
tech-stack:
  added: []
  patterns: [batch-git-diff, self-contained-scripts]
key-files:
  created:
    - skills/kata-map-codebase/scripts/detect-stale-intel.cjs
    - skills/kata-execute-phase/scripts/check-conventions.cjs
  modified: []
decisions:
  - Batch git diff per unique lastIndexed commit (O(1) per group) instead of per-file git log
  - Convention violations are warnings only, never blockers
  - Scripts are self-contained (copied functions from scan-codebase.cjs, no cross-skill imports)
  - Both scripts exit 0 in all cases (non-blocking)
metrics:
  duration: 3m
  completed: 2026-02-16
---

# Phase 57 Plan 01: Staleness Detection & Convention Enforcement Scripts Summary

Batch git diff staleness detection and regex-based convention enforcement as standalone Node.js CJS scripts

## What Was Built

**detect-stale-intel.cjs** reads `.planning/intel/index.json`, groups entries by their `lastIndexed` commit hash, runs one `git diff --name-only {commit}..HEAD` per unique commit, and outputs a JSON report with stale/fresh file lists, staleness percentage, and oldest stale commit reference. Falls back to top-level `commitHash` for entries without per-file `lastIndexed`. Handles invalid commits (deleted/rebased) by treating all files in that group as stale. Detects brownfield doc-based intel via `.planning/codebase/` directory presence.

**check-conventions.cjs** reads `.planning/intel/conventions.json`, accepts `--files` with a list of file paths, filters to supported code extensions (js/ts/py/go/rs/java), extracts exported identifiers using the same regex patterns from scan-codebase.cjs, and compares naming style against the dominant convention. Skips checks when confidence < 0.7, pattern is `insufficient_data` or `mixed`, or no supported files remain after filtering. Outputs violations as JSON with file, export name, found style, expected style, and severity.

Both scripts use `resolveProjectRoot()` for project root detection and export their main functions via `module.exports` for testing.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create detect-stale-intel.cjs | a257fb8 | skills/kata-map-codebase/scripts/detect-stale-intel.cjs |
| 2 | Create check-conventions.cjs | 5429cd3 | skills/kata-execute-phase/scripts/check-conventions.cjs |

## Deviations from Plan

None. Plan executed as written.

## Decisions Made

1. **Batch git diff per commit group** -- Groups files by lastIndexed commit and runs one git diff per unique commit. Benchmarked at <50ms vs 265ms for per-file approach on 47 files.
2. **Self-contained scripts** -- Copied classifyIdentifier(), extractJSExports(), extractPythonExports(), extractGoExports(), extractRustExports(), extractJavaExports(), stripComments(), stripPythonComments(), and getLanguage() inline from scan-codebase.cjs. No cross-skill imports per build system rules.
3. **Non-blocking exit codes** -- Both scripts exit 0 in all cases including errors and missing data. They are diagnostic tools, not gatekeepers.

## Verification Results

- detect-stale-intel.cjs syntax check: PASS
- check-conventions.cjs syntax check: PASS
- detect-stale-intel.cjs JSON output valid: PASS (totalIndexed=41, stalePct=0)
- check-conventions.cjs JSON output valid: PASS (checked=2, conventionPattern=camelCase)
- Extension filter (README.md skipped): PASS (checked=0, skipped reason)
- Graceful degradation (no .planning/): PASS (both exit 0)
- No cross-skill imports: PASS (no require('../kata-' patterns)
- classifyIdentifier regex matches scan-codebase.cjs: PASS (identical)
- Build: PASS (npm run build:plugin)
- Tests: PASS (44/44)

## Next Phase Readiness

Plan 02 (orchestrator integration) can proceed. Both scripts are tested and committed. The orchestrator needs to:
1. Run detect-stale-intel.cjs in step 7.25 and trigger incremental re-scan when staleness detected
2. Run check-conventions.cjs against phase-changed files and log violations
