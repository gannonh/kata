---
phase: 47-downstream-release
plan: 02
subsystem: milestone-completion
tags: [release-verification, active-tasks, AskUserQuestion, post-release]
dependency-graph:
  requires: [47-01]
  provides: [active-post-release-verification]
  affects: []
tech-stack:
  added: []
  patterns: [task-menu-loop, active-verification]
key-files:
  created: []
  modified:
    - skills/kata-complete-milestone/SKILL.md
decisions:
  - Task menu loop pattern for multi-step verification
  - Sub-questions for failure handling within each task
metrics:
  duration: 2 min
  completed: 2026-02-10
---

# Phase 47 Plan 02: Active Post-Release Verification Summary

**One-liner:** Replace passive post-release checklist with active task offerings that execute smoke tests, verify artifacts, and check CI/CD status on the user's behalf.

## What Was Done

Rewrote step 8 ("Post-release verification") in `kata-complete-milestone/SKILL.md`. The passive checklist display with a simple verified/failed/skip question was replaced with an active task menu loop using AskUserQuestion.

### New Step 8 Flow

1. Presents task menu with four options: Run smoke tests, Verify release artifacts, Check CI/CD status, Everything looks good
2. Each task executes real commands (`npm test`, version file checks, `gh run list`)
3. Reports results and offers sub-choices on failure (fix, investigate, continue)
4. Loops back to menu (minus completed tasks) for multiple verifications
5. Exits to step 9 when user selects "Everything looks good" or all tasks done

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f32884e | Replace passive checklist with active task offerings |

## Deviations from Plan

None. Plan executed exactly as written.

## Decisions Made

1. **Task menu loop pattern** — Re-presents remaining tasks after each completion, consistent with progressive-disclosure UX
2. **Sub-questions for failures** — Each verification task has its own failure-handling AskUserQuestion rather than a single global escape hatch

## Verification Results

- Step 8 uses AskUserQuestion with concrete task options
- Each option runs actual commands (npm test, version checks, gh run list)
- Loop allows multiple verifications before proceeding
- Exit option ("Everything looks good") preserved
- Steps 0-7 and step 9 unchanged
- AskUserQuestion pattern matches existing usage in the skill
- Build succeeds, all 44 tests pass

## Next Phase Readiness

Phase 47 plan 02 complete. No blockers for subsequent work.
