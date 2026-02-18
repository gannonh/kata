---
phase: 58-brownfield-doc-auto-refresh
plan: 02
subsystem: codebase-intelligence
tags: [brownfield, staleness-detection, testing]
requires: [detectBrownfieldDocStaleness]
provides: [brownfield-staleness-test-coverage]
affects: [detect-stale-intel.test.js]
tech-stack:
  added: []
  patterns: [temp-git-repos, backdated-commits, isolated-test-fixtures]
key-files:
  created: [tests/scripts/detect-stale-intel.test.js]
  modified: []
decisions:
  - Backdated commits via GIT_AUTHOR_DATE/GIT_COMMITTER_DATE for deterministic staleness
  - 10 source files per test repo for meaningful percentage calculations
  - Followed scan-codebase.test.js patterns for consistency
metrics:
  duration: ~3 min
  completed: 2026-02-17
---

# Phase 58 Plan 02: Brownfield Staleness Detection Tests Summary

Added 5 unit tests for detectBrownfieldDocStaleness() covering all edge cases identified in research: missing codebase dir, fresh docs, stale docs exceeding 30% threshold, malformed dates, and mixed docs with partial Analysis Date headers.

## Tasks Completed

| # | Task | Commit |
|---|------|--------|
| 1 | Create test file with temp git repo setup | c8e9074 |
| 2 | Write 5 brownfield staleness test cases | c8e9074 |

## What Was Built

- `tests/scripts/detect-stale-intel.test.js` with 5 test cases
- Temp git repo scaffolding (beforeEach/afterEach with isolated repos)
- `writeBrownfieldDoc()` helper for creating brownfield docs with controlled Analysis Dates
- `modifyAndCommit()` helper for simulating source file changes

## Test Cases

1. No .planning/codebase/ directory returns `brownfieldDocStale: false`
2. Analysis Date exists, no files changed returns `brownfieldDocStale: false`
3. Analysis Date exists, >30% files changed returns `brownfieldDocStale: true`
4. Malformed Analysis Date returns `brownfieldDocStale: false`
5. Mixed docs (some with, some without Analysis Date) picks first valid date

## Key Testing Technique

Test 3 uses `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` environment variables to backdate the brownfield doc commit. This ensures `git log --until` resolves to the correct base commit rather than HEAD (which would happen if all commits share the same timestamp).

## Deviations

None.
