---
phase: 01-migrate-todo-commands
plan: 02
subsystem: tooling
tags: [skills, todos, check-operation, actions, AskUserQuestion]

# Dependency graph
requires:
  - phase: 01-01
    provides: Todo skill with ADD operation and format reference
provides:
  - Complete kata-todo-management skill with ADD and CHECK operations
  - Action workflows reference for todo review
affects: [skill installation, user todo workflows]

# Tech tracking
tech-stack:
  added: []
  patterns: [AskUserQuestion for action selection, action routing table pattern]

key-files:
  created:
    - skills/kata-todo-management/references/actions.md
  modified:
    - skills/kata-todo-management/SKILL.md

key-decisions:
  - "6 action options: work on, add to phase, create phase, brainstorm, put back, mark complete"
  - "Actions.md as reference rather than inline to keep SKILL.md under 500 lines"
  - "Work on now does NOT move to done (user marks complete later)"

patterns-established:
  - "Action routing table pattern for multi-option AskUserQuestion"
  - "STATE.md update after pending count changes"
  - "Action summary table with file/state/continuation columns"

# Metrics
duration: 2min
completed: 2026-01-20
---

# Phase 01 Plan 02: Add CHECK Operation to Todo Skill Summary

**Todo review workflow with 6 action options routed via AskUserQuestion, actions.md reference for detailed workflows**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-20T17:41:29Z
- **Completed:** 2026-01-20T17:42:59Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Added CHECK operation workflow to SKILL.md with 4 steps: list pending, review each, route by selection, update STATE and summarize
- Created AskUserQuestion integration with 6 action options for todo triage
- Created comprehensive actions.md reference documenting all 6 action workflows with steps, edge cases, and STATE.md update pattern
- Added action summary table showing file movement, state updates, and continuation behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CHECK operation workflow to SKILL.md** - `bf3f5e6` (feat)
2. **Task 2: Create references/actions.md with detailed action workflows** - `e3fb0ce` (docs)

## Files Created/Modified

- `skills/kata-todo-management/SKILL.md` - Added CHECK operation (311 lines total, under 500 limit)
- `skills/kata-todo-management/references/actions.md` - New file with 6 action workflows and STATE.md update pattern

## Decisions Made

- **6 action options:** work on now, add to current phase, create new phase, brainstorm ideas, put back, mark complete (covers all common todo triage paths)
- **Work on now behavior:** Does NOT move to done/ - user works on it and explicitly marks complete later (avoids accidental completion)
- **Actions in separate file:** Keeps SKILL.md focused on routing logic while actions.md provides detailed step-by-step workflows
- **Create phase routes to roadmap skill:** Leverages existing kata-managing-project-roadmap rather than duplicating logic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- kata-todo-management skill complete with ADD and CHECK operations
- Ready for installation testing in Plan 01-03
- Skill follows established patterns (SKILL.md + references/)

---
*Phase: 01-migrate-todo-commands*
*Completed: 2026-01-20*
