---
phase: 45-worktree-scripting
plan: 01
subsystem: execution-scripts
tags: [bash, git-worktree, lifecycle-management]
depends_on:
  requires: [44-01, 44-02]
  provides: [manage-worktree.sh with create/merge/list subcommands]
  affects: [45-02, 46]
tech-stack:
  added: []
  patterns: [key-value-output, precondition-validation, idempotent-create]
key-files:
  created:
    - skills/kata-execute-phase/scripts/manage-worktree.sh
  modified: []
decisions: []
metrics:
  duration: 4 min
  completed: 2026-02-09
---

# Phase 45 Plan 01: manage-worktree.sh create/merge/list Summary

Worktree lifecycle management script with three subcommands for plan-level isolation using git worktrees and plan-specific branches.

## What Was Built

`manage-worktree.sh` provides plan-level worktree lifecycle operations:

- **create**: Spawns `plan-{phase}-{plan}` worktree directory with `plan/{phase}-{plan}` branch from base. Idempotent (returns existing info if worktree already exists).
- **merge**: Fast-forward merges plan branch to base in main worktree, removes worktree directory, deletes plan branch. Validates clean state before merge.
- **list**: Parses `git worktree list --porcelain` output, filters plan-* entries, extracts phase/plan metadata. Returns `WORKTREE_COUNT` and table.

All subcommands validate preconditions (bare repo layout via `.bare/`, `worktree.enabled` config via `read-config.sh`) and produce parseable key=value output matching the `find-phase.sh` output pattern.

## Task Completion

| Task | Name | Commit | Status |
| ---- | ---- | ------ | ------ |
| 1 | Create manage-worktree.sh with create subcommand | 1be3e8d | Done |
| 2 | Implement merge and list subcommands | 9024a50 | Done |

## Deviations from Plan

None - plan executed as written.

## Decisions Made

No architectural decisions required.

## Verification Results

- Script exists and is executable
- Usage message displays on no-args invocation
- All three subcommands (create, merge, list) implemented
- Precondition checks for bare repo and worktree.enabled present
- Key=value output pattern consistent with find-phase.sh
- `npm run build:plugin && npm test` passes (44/44 tests)

## Next Phase Readiness

Plan 45-02 (extract inline scripts) can proceed. Phase 46 (execution integration) depends on both 45-01 and 45-02 completion.
