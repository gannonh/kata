---
phase: 02-phase-movement
plan: 01
subsystem: phase-management
tags: [phase-numbering, milestone, move-phase, skill]
dependency-graph:
  requires: [01-phase-organization]
  provides: [kata-move-phase skill, per-milestone numbering]
  affects: [02-02 reorder capability, 03-roadmap-enhancements]
tech-stack:
  added: []
  patterns: [per-milestone phase numbering, cross-milestone phase movement]
key-files:
  created:
    - skills/kata-move-phase/SKILL.md
  modified:
    - skills/kata-add-milestone/SKILL.md
    - skills/kata-complete-milestone/references/milestone-archive-template.md
    - skills/kata-complete-milestone/references/milestone-complete.md
    - agents/kata-roadmapper.md
decisions:
  - id: per-milestone-numbering
    description: Each milestone starts phase numbering at 1 (independent numbering)
    rationale: Milestones are self-contained units; cumulative numbering created unnecessary coupling
metrics:
  duration: 4 min
  completed: 2026-02-03
---

# Phase 2 Plan 01: Per-Milestone Numbering and Move-Phase Skill Summary

Per-milestone phase numbering starting at 1 enforced across 4 files; new kata-move-phase skill created for cross-milestone phase movement.

## Tasks Completed

### Task 1: Update 4 files for per-milestone phase numbering (PHASE-04)

Updated 4 files to replace cumulative numbering guidance with per-milestone numbering at 1:

| File | Change |
| ---- | ------ |
| `skills/kata-add-milestone/SKILL.md` | Replaced "continues from previous milestone" with "start at 1", updated success criteria, fixed context label |
| `skills/kata-complete-milestone/references/milestone-archive-template.md` | Replaced "never restart at 01" with "starts at 1" |
| `skills/kata-complete-milestone/references/milestone-complete.md` | Replaced "numbering continues (v1.0 phases 1-4, v1.1 phases 5-8)" with independent numbering per milestone |
| `agents/kata-roadmapper.md` | Simplified starting number from conditional (new vs continuing) to always 1 |

**Commit:** `092c0a7`

### Task 2: Create kata-move-phase skill (PHASE-02)

Created `skills/kata-move-phase/SKILL.md` (433 lines) with:

- Argument parsing: `/kata:kata-move-phase N to vX.Y`
- 14 process steps: parse_arguments, load_state, validate_phase_exists, validate_phase_movable, validate_target_milestone, calculate_destination_number, confirm_move, remove_from_source_milestone, add_to_target_milestone, rename_phase_directory, renumber_source_directories, update_state, commit, completion
- Universal phase discovery pattern from Phase 1
- Validation: only pending phases, no executed plans, target milestone must exist
- Anti-patterns, edge cases, success criteria sections
- Reorder capability stubbed for Plan 02

**Commit:** `adc72d7`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale success criteria in kata-add-milestone**

- **Found during:** Task 1
- **Issue:** Success criteria line 1057 still said "phases continuing from previous milestone" after updating the instructions above it
- **Fix:** Changed to "phases starting at 1 (per-milestone numbering)"
- **Files modified:** `skills/kata-add-milestone/SKILL.md`
- **Commit:** `092c0a7` (included in Task 1 commit)

**2. [Rule 1 - Bug] Fixed misleading context label in kata-add-milestone**

- **Found during:** Task 1
- **Issue:** Line 728 labeled MILESTONES.md reference as "Previous milestone (for phase numbering)" which is misleading since numbering no longer depends on previous milestone
- **Fix:** Changed to "Previous milestones (shipped context)"
- **Files modified:** `skills/kata-add-milestone/SKILL.md`
- **Commit:** `092c0a7` (included in Task 1 commit)

## Decisions Made

| Decision | Rationale | Outcome |
| -------- | --------- | ------- |
| Per-milestone numbering at 1 | Milestones are self-contained; v1.5.0 already uses this pattern | Codified as standard |
| Single skill for move + reorder | Shared validation/renumbering logic, single name from requirements | Reorder stubbed for Plan 02 |

## Verification Results

- No references to cumulative numbering remain in modified files
- New text "numbering at 1" / "independent numbering" present in all 4 updated files
- kata-move-phase has valid YAML frontmatter with `name: kata-move-phase`
- All 14 required process steps present
- Universal phase discovery pattern used (2 occurrences)
- Anti-patterns, edge_cases, success_criteria sections present

## Next Phase Readiness

Plan 02 will add reorder capability (`/kata:kata-move-phase N before M`) to the kata-move-phase skill created here.
