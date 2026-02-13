---
phase: 49-script-layer-phase-worktrees
plan: 02
subsystem: worktree-management
tags: [manage-worktree, phase-worktree, merge-target, cleanup]
dependencies: [49-01]
metrics:
  tasks_completed: 2
  tasks_total: 2
  tests_added: 3
  tests_updated: 6
  tests_total: 13
  duration_seconds: 230
  started: 2026-02-13T20:25:41Z
  completed: 2026-02-13T20:29:31Z
commits:
  - hash: d6ae757
    message: "feat(49-02): modify manage-worktree.sh for phase worktree merge target"
  - hash: 7caae78
    message: "test(49-02): update manage-worktree tests for phase worktree merge target"
---

## Summary

Modified `manage-worktree.sh` to eliminate hardcoded `main/` as the merge target. Three changes:

1. **Removed `resolve_base_branch`** (MT-02). The function fell back to reading `main/`'s current branch, which is the behavior the v1.11.0 refactor eliminates. `cmd_create` and `cmd_merge` now require explicit base branch arguments from the caller.

2. **Changed `cmd_merge` target** (MT-01). The merge target is now a caller-specified directory (`merge_target_dir` parameter) instead of hardcoded `main/`. All `git -C main` operations, untracked file cleanup, and error messages reference `$merge_target_dir`. The orchestrator passes the phase worktree path.

3. **Added `cleanup-phase` subcommand** (WT-05). Removes a phase worktree via `GIT_DIR=.bare git worktree remove` and deletes the phase branch via `git branch -d`. Guards against missing directories and uncommitted changes.

## Test Coverage

Updated 6 existing tests (create and merge) to use explicit base branch arguments. Merge tests now create a phase worktree (`phase-wt`) and verify files appear there instead of `main/`. Added 3 new cleanup-phase tests: success case (worktree + branch removed), missing directory error, and uncommitted changes error.

All 67 script tests pass. All 44 build/migration tests pass.

## Files Changed

- `skills/kata-execute-phase/scripts/manage-worktree.sh` — removed `resolve_base_branch`, updated `cmd_create`/`cmd_merge` signatures, added `cmd_cleanup_phase`, updated usage text and case statement
- `tests/scripts/manage-worktree.test.js` — updated create/merge tests for explicit base branch, added cleanup-phase test suite
