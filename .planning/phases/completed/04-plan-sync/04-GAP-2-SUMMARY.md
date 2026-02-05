---
phase: 04
plan: GAP-2
subsystem: planning-skill
tags: [bug-fix, step-routing, github-integration, uat-finding]
requires: [04-GAP]
provides: [explicit-step-routing]
affects: [kata-planning-phases]
tech-stack:
  added: []
  patterns: [explicit-routing-instructions]
key-files:
  created: []
  modified: [skills/kata-planning-phases/SKILL.md]
decisions:
  explicit-routing: "Use action verbs ('Execute Step X now') instead of passive routing ('Proceed to step X')"
metrics:
  duration: 5 min
  completed: 2026-01-26
---

# Phase 04 Plan GAP-2: Fix Step 11→13 Routing Summary

**One-liner:** Made Step 11 routing explicit with action verbs to prevent Claude skipping the GitHub integration step.

## Root Cause

UAT found that after plan verification passed, Claude said "Now I'll present the final status" and jumped directly to the banner — never executing Step 13's GitHub update commands.

The issue: Step 11 said "Proceed to step 13" which Claude interpreted loosely. The "(if enabled)" in Step 13's title also signaled the step was optional.

## What Was Done

### Task 1: Make Step 11 routing explicit (2d313ed)

**Before:**
```markdown
**If `## VERIFICATION PASSED`:**
- Display: `Plans verified. Ready for execution.`
- Proceed to step 13
```

**After:**
```markdown
**If `## VERIFICATION PASSED`:**
- Display: `Plans verified. Checking GitHub integration...`
- **Execute Step 13 now** — run the GitHub config check and issue update
```

### Task 2: Remove optional signal from Step 13 title

**Before:** `## 13. Update GitHub Issue with Plan Checklist (if enabled)`
**After:** `## 13. GitHub Integration Check`

### Task 3: Add explicit transition to Step 14

Added at end of Step 13:
```markdown
**After GitHub check completes (success or skip), proceed to Step 14.**
```

## Verification Results

All 10 content tests pass:
- ✓ Step 11 has explicit Execute instruction
- ✓ Step 13 title is neutral (not optional)
- ✓ Step 13 routes to Step 14
- ✓ All original Plan Sync tests still pass

## Files Modified

| File | Change |
|------|--------|
| skills/kata-planning-phases/SKILL.md | Step 11 routing, Step 13 title, Step 13 end routing |

## Commit Log

| Commit | Message |
|--------|---------|
| 2d313ed | fix(04-GAP-2): make Step 11→13 routing explicit to prevent Claude skipping GitHub update |

## Next Steps

- [ ] UAT retest: Run `/kata:plan-phase` on test project and verify GitHub issue gets plan checklist
- [ ] If passing, continue UAT for remaining tests (2-4)
