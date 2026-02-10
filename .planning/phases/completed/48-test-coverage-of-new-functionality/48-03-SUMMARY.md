---
phase: 48-test-coverage-of-new-functionality
plan: 03
subsystem: testing
tags: [manage-worktree, test-runner, glob]
duration: 3min
completed: 2026-02-10
---

# Phase 48 Plan 03: manage-worktree Tests and Test Runner Wiring Summary

8 tests for manage-worktree.sh (preconditions, create, list) plus glob-based test:scripts wiring for automatic test discovery.

## Accomplishments

- Created `manage-worktree.test.js` with 8 test cases covering all non-merge functionality
- Updated `test:scripts` and `test:all` to use `./tests/scripts/*.test.js` glob
- All 47 script tests pass across 6 test files in under 2 seconds

## Task Commits

| Hash | Message |
|------|---------|
| dd7c4a6 | test(48-03): add manage-worktree.sh tests |
| 88835fc | chore(48-03): glob test:scripts and test:all to auto-discover test files |

## Files Created/Modified

- `tests/scripts/manage-worktree.test.js` (created) — 8 tests: .bare missing, worktree.enabled false, unknown subcommand, usage output, create worktree, idempotent create, list worktrees, empty list
- `package.json` (modified) — test:scripts and test:all now use glob patterns

## Deviations

None — plan executed exactly as written.

## Decisions Made

- Used manual bare repo construction (git clone --bare) instead of running setup-worktrees.sh, avoiding the complexity of the full conversion cleanup that deletes project root files
- Skipped merge subcommand testing as specified (slow, fragile checkout/merge in temp repos)
- create-draft-pr.sh remains intentionally untested (requires gh CLI + GitHub remote)
