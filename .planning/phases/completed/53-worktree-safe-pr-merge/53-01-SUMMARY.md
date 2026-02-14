---
phase: 53-worktree-safe-pr-merge
plan: 01
subsystem: skills
tags: [worktree, merge, pr-workflow, gap-closure]
requires: []
provides: [worktree-safe-merge-pattern]
affects: [kata-verify-work, kata-complete-milestone]
tech-stack:
  added: []
  patterns: [conditional-worktree-branching]
key-files:
  created: []
  modified:
    - skills/kata-verify-work/SKILL.md
    - skills/kata-complete-milestone/SKILL.md
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-14T21:52:16Z
---

# Phase 53 Plan 01: Worktree-Safe PR Merge Summary

Replaced broken `gh pr merge --merge --delete-branch` + `git checkout main && git pull` pattern with conditional worktree-safe merge in kata-verify-work (2 locations) and kata-complete-milestone (1 location).

## Changes

### kata-verify-work/SKILL.md
- Added `WORKTREE_ENABLED` config read in step 7.5 alongside existing `PR_WORKFLOW` read
- Route A merge block: replaced `--delete-branch` + standalone checkout with `gh pr merge --merge` followed by conditional local state update
- Route B merge block: identical replacement

### kata-complete-milestone/SKILL.md
- Release PR merge block: replaced `--delete-branch` + standalone checkout with `gh pr merge --merge` followed by conditional local state update
- Skill already reads `WORKTREE_ENABLED` at line 47, no config read addition needed

### Worktree-safe pattern (all 3 locations)
```bash
gh pr merge "$PR_NUMBER" --merge

if [ "$WORKTREE_ENABLED" = "true" ]; then
  git -C main pull
  bash "skills/kata-execute-phase/scripts/manage-worktree.sh" cleanup-phase workspace "$PHASE_BRANCH"
else
  git checkout main && git pull  # or separate lines for kata-complete-milestone
fi
```

## Commits

- `50b8dc0`: feat(53-01): replace broken merge pattern with worktree-safe merge in kata-verify-work
- `11da6aa`: feat(53-01): replace broken merge pattern with worktree-safe merge in kata-complete-milestone
