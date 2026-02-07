# Phase 36: Workflow Integration — UAT

**Date:** 2026-02-07
**Tester:** User
**Status:** PASSED (6/6)

## Tests

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 1 | kata-add-milestone has brainstorm gate (Phase 1.5) | Gate between Load Context and Gather Milestone Goals | PASS | |
| 2 | kata-new-project has brainstorm gate (Phase 3 opening) | Gate before "What do you want to build?" | PASS | Fixed: moved gate from Phase 3.5 to Phase 3 opening. Brainstorm happens before you know what to build. |
| 3 | kata-discuss-phase: inline gate removed | No brainstorm interruption in flow | PASS | Removed per UAT feedback: brainstorm adds value for "what to build" not "how to build" |
| 4 | kata-research-phase: brainstorm in next-steps menu | Brainstorm surfaced as menu choice after research completes | PASS | Added "Brainstorm ideas" to next-step options |
| 5 | kata-plan-phase: gate removed, brainstorm in "Also available" | No inline gate, brainstorm as alternative path | PASS | |
| 6 | Context wiring: planner/researcher load brainstorm SUMMARY.md | Brainstorm output feeds downstream agents as optional context | PASS | 4 injection points, all graceful on missing |

## Issues Found During UAT

### Issue 1: kata-new-project brainstorm gate positioned after questioning (FIXED)

**Severity:** Medium
**Description:** Brainstorm gate was at Phase 3.5 (after deep questioning, before PROJECT.md). Users brainstorm to figure out what to build, so the gate should come before "What do you want to build?"
**Fix:** Moved gate to Phase 3 opening as AskUserQuestion: "I know what I want to build" vs "Brainstorm first". Removed Phase 3.5.
**Commit:** 857232b

### Issue 2: Too many brainstorm interjections (FIXED)

**Severity:** Medium
**Description:** 5 inline brainstorm gates across workflows created excessive interruptions. Brainstorm adds value for "what to build" decisions, not "how to build."
**Fix:** Kept gates in add-milestone and new-project (what to build). Removed inline gates from discuss-phase, research-phase, plan-phase. Surfaced brainstorm as alternative path in offer_next sections instead.
**Commit:** 056a91a
