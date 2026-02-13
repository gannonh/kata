---
phase: 50
plan: 01
subsystem: orchestrator
tags: [worktree, phase-execution, git-workflow]
depends_on: [49]
provides: [phase-worktree-lifecycle-in-orchestrator]
affects: [50-02]
tech-stack:
  patterns: [phase-worktree-isolation, GIT_DIR_FLAG-array, three-case-working-directory]
key-files:
  modified:
    - skills/kata-execute-phase/SKILL.md
decisions:
  - Step 0.7 reads both WORKTREE_ENABLED and PR_WORKFLOW early so all later steps can reference them
  - GIT_DIR_FLAG array pattern used in step 10 to avoid duplicating git commands for worktree vs non-worktree
  - Phase worktree cleanup deferred to post-merge (worktree must persist for PR branch validity)
  - Activation commit in step 1.5 now runs inside phase worktree via git -C
metrics:
  duration: 5m 28s
  completed: 2026-02-13
---

# Phase 50 Plan 01: Wire Phase Worktree Setup and Wave Execution Summary

Phase worktree lifecycle wired into SKILL.md steps 0.7/1.5/4/10/10.5 with three-case working directory injection and GIT_DIR_FLAG conditional pattern for all git operations.

## Changes

**Step 0.7:** Reads both `WORKTREE_ENABLED` and `PR_WORKFLOW` config values early for all subsequent steps.

**Step 1.5:** Captures `PHASE_WORKTREE_PATH` and `PHASE_BRANCH` from `create-phase-branch.sh` output. Removed duplicate `PR_WORKFLOW` read. Activation commit uses `git -C` to target the phase worktree.

**Step 4 (worktree create):** Passes `PHASE_BRANCH` as third arg to `manage-worktree.sh create`. Added `PR_WORKFLOW=true` guard.

**Step 4 (worktree merge):** Passes `PHASE_BRANCH` and `PHASE_WORKTREE_PATH` as third and fourth args to `manage-worktree.sh merge`. Added `PR_WORKFLOW=true` guard.

**Step 4 (draft PR):** Pushes from phase worktree via `git -C "$PHASE_WORKTREE_PATH"`. Uses `$PHASE_BRANCH` instead of `git branch --show-current`.

**Step 4 (wave_execution):** Three-case working directory injection:
1. `PR_WORKFLOW=true` + `WORKTREE_ENABLED=true`: plan-specific worktree path
2. `PR_WORKFLOW=true` + `WORKTREE_ENABLED=false`: phase worktree path
3. `PR_WORKFLOW=false`: no working_directory block

**Step 10:** Uses `GIT_DIR_FLAG` array pattern conditional on `PR_WORKFLOW`. When true, all `git add` and `git commit` operations target the phase worktree via `-C`. When false, array expands to nothing (preserves current behavior).

**Step 10.5:** Pushes from phase worktree via `git -C`. Uses `$PHASE_BRANCH` for all branch references. Commits remaining planning state before push. Documents `cleanup-phase` for post-merge worktree removal.

## Verification

- `npm run build:plugin` passes
- `npm test` passes (44/44)
- Zero `git branch --show-current` in SKILL.md
- Zero `git -C main` in SKILL.md
- manage-worktree.sh create receives 3 args
- manage-worktree.sh merge receives 4 args
- Step 10 has no bare git commands outside GIT_DIR_FLAG conditional

## Deviations

None. Plan executed as written.

## Commits

- `44b0155`: feat(50-01): wire phase worktree setup and wave execution in SKILL.md
- `8b2ddd7`: feat(50-01): wire phase worktree PR/merge and cleanup in SKILL.md
