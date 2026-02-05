---
phase: 04-plan-sync
plan: GAP
title: Fix step ordering in kata-planning-phases
type: gap
source: UAT
status: ready
---

# Phase 04 GAP Plan: Fix Step Ordering Bug

<objective>
Fix kata-planning-phases skill so GitHub issue update (Step 14) executes before presenting final status (Step 13). Currently Step 13 says "Route to offer_next" which causes Claude to skip Step 14 entirely.
</objective>

<context>
- **UAT Finding:** Plan checklist not synced to GitHub issue after planning
- **Root Cause:** Step 14 placed after Step 13's "Route to offer_next" instruction
- **Impact:** GitHub integration feature doesn't work in production
</context>

<tasks>
<task type="auto">
  <name>Task 1: Swap steps 13 and 14 in kata-planning-phases</name>
  <files>skills/kata-planning-phases/SKILL.md</files>
  <action>
1. Find "## 13. Present Final Status" section (around line 469)
2. Find "## 14. Update GitHub Issue with Plan Checklist" section (around line 473)
3. Swap the section order:
   - Rename current Step 14 → "## 13. Update GitHub Issue with Plan Checklist"
   - Rename current Step 13 → "## 14. Present Final Status"
4. Update Step 14 (new "Present Final Status") to say:
   "Display the planning summary and route to `<offer_next>`."
   (Remove the premature "Route to offer_next" from old Step 13)
  </action>
  <verify>grep -n "## 13\." skills/kata-planning-phases/SKILL.md | head -1</verify>
  <done>"## 13. Update GitHub Issue" appears before "## 14. Present Final Status"</done>
</task>
</tasks>

<success_criteria>
- [ ] Step 13 is now "Update GitHub Issue with Plan Checklist"
- [ ] Step 14 is now "Present Final Status" with route to offer_next
- [ ] No "Route to offer_next" before GitHub update step
</success_criteria>
