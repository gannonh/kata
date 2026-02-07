---
phase: 36
plan: 01
subsystem: skills
tags: [brainstorm, workflow-integration, skills]
requires: [35]
provides: [brainstorm-gates-in-workflows]
affects: [36-02, 36-03]
tech-stack:
  added: []
  patterns: [askuserquestion-gate, optional-sub-skill-invocation]
key-files:
  created: []
  modified:
    - skills/kata-add-milestone/SKILL.md
    - skills/kata-new-project/SKILL.md
    - skills/kata-discuss-phase/SKILL.md
decisions:
  - Brainstorm gates use half-step numbering (1.5, 3.5, 2.5) to avoid renumbering existing steps
  - All three gates use identical AskUserQuestion pattern for consistency
  - Parent skills do not pre-check Agent Teams prerequisite (brainstorm skill handles this)
metrics:
  duration: ~1 min
  completed: 2026-02-07
---

# Phase 36 Plan 01: Workflow Brainstorm Gates Summary

Add optional brainstorm gates to three skill workflows, allowing users to run structured explorer/challenger brainstorm sessions at natural decision points.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add brainstorm gate to kata-add-milestone | c96634c | skills/kata-add-milestone/SKILL.md |
| 2 | Add brainstorm gate to kata-new-project | c580b21 | skills/kata-new-project/SKILL.md |
| 3 | Add brainstorm gate to kata-discuss-phase | 867acb5 | skills/kata-discuss-phase/SKILL.md |

## What Was Built

Three optional brainstorm integration points:

- **kata-add-milestone Phase 1.5** — Between Load Context and Gather Milestone Goals
- **kata-new-project Phase 3.5** — Between Deep Questioning and Write PROJECT.md
- **kata-discuss-phase Step 2.5** — Between CONTEXT.md check and gray area analysis

Each gate follows the same pattern:
1. AskUserQuestion with header "Brainstorm" and two options
2. "Brainstorm first" invokes `/kata-brainstorm` as a sub-skill
3. "Skip" continues the parent workflow unchanged

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Half-step numbering (1.5, 3.5, 2.5) | Avoids renumbering existing phases/steps, preserves all external references |
| Identical AskUserQuestion pattern across all three | Consistent UX, predictable behavior regardless of entry point |
| No prerequisite checking in parent skills | Brainstorm skill owns its own Agent Teams prerequisite check |

## Deviations

None — plan executed exactly as written.

## Next Phase Readiness

No blockers. Plan 36-02 and 36-03 can proceed independently.
