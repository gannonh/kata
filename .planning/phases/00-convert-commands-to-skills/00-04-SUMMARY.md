---
phase: 00-convert-commands-to-skills
plan: 04
subsystem: skills
tags: [skills, project-initialization, discovery, roadmap, orchestrator]

# Dependency graph
requires:
  - phase: 00-01
    provides: kata-planning-phases skill pattern and structure
provides:
  - kata-starting-new-projects skill for new project setup
  - discovery-protocol reference for user interviews
  - project-template reference for PROJECT.md structure
  - roadmap-creation reference for ROADMAP.md structure
affects: [execution, verification, milestone-management]

# Tech tracking
tech-stack:
  added: []
  patterns: [skill-as-orchestrator, progressive-disclosure, sub-agent-spawning]

key-files:
  created:
    - skills/kata-starting-new-projects/SKILL.md
    - skills/kata-starting-new-projects/references/discovery-protocol.md
    - skills/kata-starting-new-projects/references/project-template.md
    - skills/kata-starting-new-projects/references/roadmap-creation.md
  modified: []

key-decisions:
  - "SKILL.md contains full orchestrator workflow (355 lines)"
  - "Three reference files for progressive disclosure"
  - "Spawns kata-project-researcher for discovery and kata-roadmapper for roadmap creation"

patterns-established:
  - "Discovery interview pattern: open question, follow threads, checklist as guide not interrogation"
  - "Brownfield detection pattern: check for existing code before project setup"
  - "Goal-backward phase derivation: derive phases from requirements, not templates"

# Metrics
duration: 4min
completed: 2026-01-19
---

# Phase 00 Plan 04: kata-starting-new-projects Skill Summary

**Project initialization orchestrator skill with discovery protocol, project template, and roadmap creation references**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-19T20:59:29Z
- **Completed:** 2026-01-19T21:03:05Z
- **Tasks:** 1
- **Files created:** 4

## Accomplishments

- Created kata-starting-new-projects skill as full orchestrator (355 lines)
- Extracted discovery interview protocol from kata-project-researcher agent
- Consolidated project template guidance from existing templates
- Documented roadmap creation process with coverage validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create kata-starting-new-projects skill with references** - `3a1ca59` (feat)

## Files Created

- `skills/kata-starting-new-projects/SKILL.md` - Main skill orchestrator handling new project onboarding
- `skills/kata-starting-new-projects/references/discovery-protocol.md` - Interview techniques, questioning patterns, context checklist
- `skills/kata-starting-new-projects/references/project-template.md` - PROJECT.md structure and section guidelines
- `skills/kata-starting-new-projects/references/roadmap-creation.md` - Phase identification, goal-backward criteria, coverage validation

## Decisions Made

- SKILL.md structured as full orchestrator that spawns sub-agents (kata-project-researcher, kata-roadmapper)
- Three reference files cover distinct aspects: discovery, project structure, roadmap creation
- Matched structure and style of kata-planning-phases skill from plan 00-01
- Discovery protocol emphasizes "follow the thread" approach over checklist interrogation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Skill structure established following kata-planning-phases pattern
- Ready for remaining skills (execution, verification, milestone management)
- Sub-agents (kata-project-researcher, kata-roadmapper) exist and are referenced

---
*Phase: 00-convert-commands-to-skills*
*Completed: 2026-01-19*
