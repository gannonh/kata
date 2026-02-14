---
phase: 53
plan: 02
subsystem: skills/kata-execute-phase, skills/kata-review-pull-requests
tags: [worktree, merge, gap-closure]
requires: []
provides: [worktree-conditional-merge-suggestions, worktree-conditional-pr-merge]
affects: [kata-execute-phase, kata-review-pull-requests]
tech-stack:
  added: []
  patterns: [worktree-conditional-branching]
key-files:
  created: []
  modified:
    - skills/kata-execute-phase/SKILL.md
    - skills/kata-review-pull-requests/SKILL.md
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-14T21:52:47Z
---

# Phase 53 Plan 02: Worktree-Conditional Merge in Execute-Phase and Review-PR Summary

Replaced unconditional `--delete-branch` merge patterns with worktree-conditional branches in two skills. kata-execute-phase offer_next Routes A and B now display the worktree-safe merge command (gh pr merge + git -C main pull + cleanup-phase) when WORKTREE_ENABLED=true, falling back to the standard --delete-branch pattern otherwise. kata-review-pull-requests now reads WORKTREE_ENABLED config and uses a conditional merge block that calls cleanup-phase for worktree layouts or git checkout main for standard repos.

## Changes

### Task 1: kata-execute-phase offer_next (display-only)
- Route A (line 563-564): replaced single unconditional `--delete-branch` suggestion with two conditional lines
- Route B (line 599-600): identical replacement
- Both branches reference `manage-worktree.sh cleanup-phase` for the worktree-safe path

### Task 2: kata-review-pull-requests (executable)
- Added `WORKTREE_ENABLED` config read alongside existing `MODEL_PROFILE` read
- Replaced single merge code block with split `gh pr merge` + conditional local state update
- Worktree path: `git -C main pull` + `cleanup-phase`
- Standard path: `git checkout main && git pull`

## Verification
- 0 unconditional `--delete-branch` across all SKILL.md files
- Both modified files reference `cleanup-phase`
- All 44 build tests pass after each task
