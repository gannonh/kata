---
phase: 04
plan: GAP
subsystem: planning-skill
tags: [bug-fix, step-ordering, github-integration]
requires: [04-03]
provides: [fix-github-issue-update-execution]
affects: [kata-planning-phases]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: [skills/kata-planning-phases/SKILL.md]
decisions:
  step-ordering: "GitHub issue update must execute before offer_next routing"
metrics:
  duration: 46s
  completed: 2026-01-26
---

# Phase 04 Plan GAP: Fix Step Ordering Bug Summary

**One-liner:** Swapped steps 13/14 in kata-planning-phases so GitHub issue update executes before final status routing.

## What Was Done

### Task 1: Swap steps 13 and 14 in kata-planning-phases (114503c)

- Renamed "## 13. Present Final Status" to "## 13. Update GitHub Issue with Plan Checklist"
- Renamed "## 14. Update GitHub Issue with Plan Checklist" to "## 14. Present Final Status"
- Step 14 now says "Display the planning summary and route to `<offer_next>`"
- Removed premature "Route to offer_next" that was in old Step 13

## Verification Results

```bash
$ grep -n "## 1[34]\." skills/kata-planning-phases/SKILL.md
469:## 13. Update GitHub Issue with Plan Checklist (if enabled)
579:## 14. Present Final Status
```

Step ordering is now correct:
- Step 13: GitHub issue update (executes first)
- Step 14: Present final status and route to offer_next (executes last)

## Deviations from Plan

None - plan executed exactly as written.

## Files Modified

| File | Change |
|------|--------|
| skills/kata-planning-phases/SKILL.md | Swapped step 13 and 14 ordering |

## Commit Log

| Commit | Message |
|--------|---------|
| 114503c | fix(04-GAP): swap steps 13/14 so GitHub issue update executes before offer_next |

## Next Phase Readiness

- [x] Fix complete
- [x] GitHub issue update will now execute during planning workflow
- [ ] UAT retest recommended to confirm fix works in production
