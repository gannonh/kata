---
phase: 06-pr-review-workflow-skill-agents
plan: 04
type: execute
status: complete
gap_closure: true

dependency-graph:
  requires: ["06-01", "06-02", "06-03"]
  provides: ["backlog-todo-prompt", "merge-first-workflow"]
  affects: []

tech-stack:
  added: []
  patterns: ["user-action-prompts"]

key-files:
  modified:
    - skills/kata-executing-phases/SKILL.md

decisions:
  - "Merge prompt uses --squash --delete-branch flags for clean history"
  - "Todo creation uses /kata:add-todo skill for consistency"
  - "Both prompts are non-blocking (phase continues regardless of choice)"

metrics:
  duration: 3min
  completed: 2026-01-27
---

# Phase 06 Plan 04: Fix UAT Gaps Summary

**One-liner:** Added backlog todo prompt for review suggestions and merge-first prompt before next phase

## What Was Built

Fixed two UAT gaps discovered during Phase 6 acceptance testing:

1. **Backlog Todo Prompt (Step 10.6):** After PR review displays suggestions, users are now prompted to create backlog todos for non-critical findings. Uses AskUserQuestion with "Yes, create todos" or "No, skip" options.

2. **Merge-First Prompt (Route A):** When pr_workflow is enabled and phase completes, users are now prompted to merge the PR before continuing to the next phase. Uses AskUserQuestion with "Yes, merge now", "No, review first", and "Skip to next phase" options.

## Task Completion

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add backlog todo prompt after PR review | f5d8433 | skills/kata-executing-phases/SKILL.md |
| 2 | Add merge prompt to offer_next Route A | 070a892 | skills/kata-executing-phases/SKILL.md |

## Verification Results

All verification checks passed:
- `grep "PR Ready for Merge"` - merge prompt exists (line 432)
- `grep "Review Suggestions"` - todo prompt exists (line 396)
- `grep "Yes, merge now"` - merge option exists (lines 435, 439)
- `grep "Yes, create todos"` - todo option exists (lines 399, 402)

## Success Criteria Met

- [x] Step 10.6 prompts to create backlog todos for review suggestions
- [x] Route A offers merge as primary action when pr_workflow enabled
- [x] Merge uses --squash --delete-branch flags
- [x] Output shows merge status and todos created count

## Deviations from Plan

None - plan executed exactly as written.

## UAT Gaps Closed

| Issue | Location | Fix |
| ----- | -------- | --- |
| No backlog todo prompt for suggestions | Step 10.6 | Added Review Suggestions AskUserQuestion |
| No merge prompt before next phase | Route A | Added PR Ready for Merge AskUserQuestion |

## Next Phase Readiness

Phase 6 UAT gaps are now closed. Recommend re-running UAT to verify fixes:
- Test #8: Backlog todo prompt should now appear after review with suggestions
- Test #9: Merge prompt should now appear before next phase suggestion

---
*Generated: 2026-01-27*
