---
phase: 02-github-issue-sync
plan: 05
subsystem: issue-management
tags: [github, self-assignment, check-issues]
requires:
  - 02-04 (in-progress label sync)
provides:
  - Self-assignment on work start via gh issue edit --add-assignee @me
affects:
  - UAT verification for GitHub sync
tech-stack:
  added: []
  patterns:
    - Non-blocking GitHub operations with warning fallback
key-files:
  created: []
  modified:
    - skills/check-issues/SKILL.md
decisions: []
metrics:
  duration: 2 min
  completed: 2026-02-01
---

# Phase 02 Plan 05: Self-Assignment on Work Start Summary

Self-assignment via gh issue edit --add-assignee @me when "Work on it now" is selected on a GitHub-linked issue.

## What Was Built

Added self-assignment logic to the check-issues skill:

1. **Path 1: Open local issue with GitHub provenance**
   - After moving file to in-progress and adding label
   - Executes `gh issue edit "$ISSUE_NUMBER" --add-assignee @me`
   - Non-blocking: warns on failure, continues workflow

2. **Path 2: GitHub-only issue**
   - After pulling to local and adding label
   - Same self-assignment logic
   - Same non-blocking behavior

3. **Confirmation messages updated**
   - Now show: "Linked to #[number], added in-progress label, assigned to @me"

4. **Success criteria updated**
   - Added: "Work on it now" assigns GitHub Issue to @me (if linked)

## Files Modified

| File | Change |
| ---- | ------ |
| skills/check-issues/SKILL.md | Added self-assignment in both work-on-it paths (+13 lines) |

## Commits

| Hash | Message |
| ---- | ------- |
| a1e6bb0 | feat(02-05): add self-assignment on work start |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Pattern `gh issue edit.*--add-assignee @me` exists in both paths (lines 338, 381)
2. Confirmation messages mention assignment status (lines 352, 393)
3. Non-blocking behavior verified (2>/dev/null with || warning pattern)
4. Success criteria includes assignment verification (line 601)

## UAT Gap Closure

This plan closes UAT Issue #4: "Missing self-assignment on GitHub"

The check-issues skill now:
- Adds in-progress label (02-04-PLAN)
- Assigns issue to @me (02-05-PLAN)
- Both operations are non-blocking
