---
phase: 07-deprecate-npx-support
plan: 06
subsystem: documentation
tags: [docs, development-workflow, plugin-distribution]

dependency_graph:
  requires: [07-04, 07-05]
  provides: [development-workflow-docs]
  affects: []

tech_stack:
  added: []
  patterns: []

key_files:
  created: []
  modified:
    - README.md
    - CLAUDE.md

decisions:
  - id: dev-workflow-update
    description: Use npm run build:plugin and --plugin-dir for local development testing

metrics:
  duration: 2 min
  completed: 2026-01-27
---

# Phase 07 Plan 06: Development Workflow Documentation Summary

Gap closure plan to fix development workflow documentation after Phase 7 verification found obsolete references.

## One-Liner

Update development docs to use `npm run build:plugin` and `--plugin-dir` flag, removing obsolete `bin/install.js --local` references.

## What Was Done

### Task 1: Update README.md Development Installation
- Replaced `node bin/install.js --local` with `npm run build:plugin`
- Added `--plugin-dir` flag documentation for local testing
- Added manual copy option as alternative workflow

### Task 2: Update CLAUDE.md Installation and Testing
- Removed obsolete warning about `bin/install.js --local`
- Replaced with `npm run build:plugin` workflow
- Added `--plugin-dir` flag documentation

### Task 3: Update CLAUDE.md Installation System section
- Marked section as deprecated
- Added pointer to new workflow
- Fixed additional obsolete reference in "Making Changes to Kata" section

## Commits

| Hash    | Type | Description                                        |
| ------- | ---- | -------------------------------------------------- |
| 6ead2d2 | docs | README development installation workflow           |
| f5464ac | docs | CLAUDE.md Installation and Testing section         |
| 588ad90 | docs | Mark Installation System section as deprecated     |

## Files Changed

| File      | Lines Changed | Summary                                       |
| --------- | ------------- | --------------------------------------------- |
| README.md | +15/-3        | Development Installation section rewritten    |
| CLAUDE.md | +19/-20       | Installation sections updated, deprecated     |

## Verification Results

All checks pass:
- No `bin/install.js --local` references in README.md or CLAUDE.md
- `npm run build:plugin` documented in both files
- `--plugin-dir` flag documented in both files
- Deprecation notice present in CLAUDE.md

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Fixed additional obsolete reference in Making Changes section**
- **Found during:** Task 3
- **Issue:** Line 182 in CLAUDE.md still referenced `node bin/install.js --local`
- **Fix:** Updated to `npm run build:plugin` and `claude --plugin-dir`
- **Files modified:** CLAUDE.md
- **Commit:** 588ad90

## Next Phase Readiness

Phase 7 gap closure complete. All development workflow documentation now reflects plugin-only distribution model.

**Phase 7 status:** COMPLETE with all gaps closed
**v1.1.0 status:** Ready for release
