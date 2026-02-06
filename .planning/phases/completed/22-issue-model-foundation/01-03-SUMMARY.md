---
phase: 01
plan: 03
subsystem: issue-management
tags: [migration, backwards-compat, skills]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [auto-migration, archived-todos]
  affects: [01-04, 01-05, 01-06]
tech-stack:
  patterns: [idempotent-migration, archive-not-delete]
key-files:
  modified:
    - skills/adding-issues/SKILL.md
    - skills/checking-issues/SKILL.md
metrics:
  duration: 1 min
  completed: 2026-01-31
---

# Phase 1 Plan 3: Add Auto-Migration Logic Summary

Auto-migration from todos to issues with archive preservation.

## What Was Done

### Task 1: Add migration step to adding-issues
Added `check_and_migrate` step before `ensure_directory` in adding-issues skill. The migration:
- Checks if legacy `.planning/todos/pending` exists AND `_archived` does not exist
- Creates new `.planning/issues/open` and `.planning/issues/closed` directories
- Copies pending todos to open issues
- Copies done todos to closed issues
- Archives originals to `.planning/todos/_archived/`

### Task 2: Add migration step to checking-issues
Added identical `check_and_migrate` step before `check_exist` in checking-issues skill. Same logic ensures migration runs regardless of which skill the user invokes first.

## Technical Details

**Migration is idempotent:** Presence of `_archived/` directory indicates migration already completed, preventing re-migration on subsequent invocations.

**Archive preservation:** Original todos are moved (not deleted) to `_archived/` subdirectory, preserving history and allowing rollback if needed.

**Copy then archive:** Files are copied first, then originals archived. This ensures issues exist before archiving originals.

## Commits

| Hash    | Type | Message                                      |
| ------- | ---- | -------------------------------------------- |
| 3ca9b97 | feat | add migration step to adding-issues skill    |
| 9f40bce | feat | add migration step to checking-issues skill  |

## Deviations from Plan

None - plan executed exactly as written.

## Must-Haves Verification

- [x] Existing todos in .planning/todos/pending/ get copied to .planning/issues/open/
- [x] Original todos archived to .planning/todos/_archived/ (not deleted)
- [x] Migration runs automatically on first skill invocation
- [x] Migration is idempotent (doesn't re-migrate if _archived exists)

## Next Plan Readiness

Ready for 01-04-PLAN.md (Update STATE.md References). Migration infrastructure in place for legacy todo support.
