---
phase: 02-phase-movement
plan: 02
subsystem: phase-management
tags: [reorder, move-phase, help, requirements-traceability]
dependency-graph:
  requires: [02-01]
  provides: [within-milestone reorder, help listing for move-phase, requirements traceability]
  affects: [03-roadmap-enhancements]
tech-stack:
  added: []
  patterns: [two-pass temp directory rename, before/after reorder semantics]
key-files:
  created: []
  modified:
    - skills/kata-move-phase/SKILL.md
    - skills/kata-help/SKILL.md
    - .planning/REQUIREMENTS.md
decisions:
  - id: three-pass-rename
    description: Use three-pass temp directory approach for reorder renames
    rationale: Avoids collision when renumbering multiple directories simultaneously
metrics:
  duration: 5 min
  completed: 2026-02-03
---

# Phase 2 Plan 02: Reorder Capability, Help Listing, and Requirements Traceability Summary

Within-milestone reorder added to kata-move-phase via before/after keywords; skill compressed from 434 to 357 lines; help listing and PHASE-02/03/04 traceability completed.

## Tasks Completed

### Task 1: Add within-milestone reorder capability to kata-move-phase (PHASE-03)

Extended kata-move-phase with 4 new reorder-specific steps:

| Step | Purpose |
| ---- | ------- |
| `validate_reorder_target` | Validate target position exists in same milestone |
| `confirm_reorder` | Show current vs new order, wait for confirmation |
| `reorder_roadmap` | Reorder phase sections in ROADMAP.md, renumber all references |
| `renumber_all_directories` | Three-pass rename (temp -> sequential -> final) to avoid collisions |

Also updated: parse_arguments (handles "before"/"after"), update_state (reorder case), commit (reorder message), completion (reorder summary). Compressed verbose cross-milestone bash examples to fit both operations in 357 lines (under 500 limit).

**Commit:** `45d03f1`

### Task 2: Update help listing and requirements traceability

1. Added kata-move-phase to kata-help under Roadmap Management section with both usage patterns
2. Marked PHASE-02, PHASE-03, PHASE-04 as `[x]` complete in REQUIREMENTS.md
3. Updated traceability table:
   - PHASE-02: Phase 2, Plans 01+02, Complete
   - PHASE-03: Phase 2, Plan 02, Complete
   - PHASE-04: Phase 2, Plan 01, Complete

**Commit:** `8cfa02b`

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Rationale | Outcome |
| -------- | --------- | ------- |
| Three-pass rename for reorder | Direct sequential rename causes collisions when phase N becomes N-1 while N-1 still exists | temp -> sequential -> final approach |
| Compress cross-milestone bash | Original 434-line skill exceeded 500 with reorder additions | Reduced verbose bash examples to directive-style instructions, 357 lines total |

## Verification Results

- kata-move-phase handles both "to" (cross-milestone) and "before"/"after" (reorder): 40+ references
- All 4 new reorder steps present (6 matches across file)
- Skill total: 357 lines (under 500 limit)
- kata-move-phase listed in kata-help under Roadmap Management
- PHASE-02, PHASE-03, PHASE-04 all marked Complete in traceability table
- All 3 requirement checkboxes marked [x]

## Next Phase Readiness

Phase 2 (Phase Movement) is complete. All 3 requirements (PHASE-02, PHASE-03, PHASE-04) delivered across Plans 01 and 02. Phase 3 (Roadmap Enhancements) can proceed with ROAD-01 and ROAD-02.
