---
phase: 02-full-conversion
plan: 01
subsystem: kata-plan-phase
tags: [subagent-migration, phase-researcher, plan-checker]
depends_on: []
provides:
  - phase-researcher instructions as skill resource
  - plan-checker instructions as skill resource
  - kata-plan-phase with zero custom subagent types
affects:
  - skills/kata-plan-phase/SKILL.md
  - skills/kata-plan-phase/references/
tech_stack:
  patterns:
    - general-purpose subagent with agent-instructions wrapper
    - skill resource extraction from agent files
key_files:
  created:
    - skills/kata-plan-phase/references/phase-researcher-instructions.md
    - skills/kata-plan-phase/references/plan-checker-instructions.md
  modified:
    - skills/kata-plan-phase/SKILL.md
decisions: []
metrics:
  duration: ~2 min
  completed: 2026-02-06T00:19:19Z
---

# Phase 2 Plan 01: Migrate phase-researcher and plan-checker Summary

Extracted phase-researcher (645 lines) and plan-checker (749 lines) agent bodies to skill reference files, then updated kata-plan-phase SKILL.md to read those files and inline them via agent-instructions wrapper using general-purpose subagent type. kata-plan-phase now has zero custom subagent types across all 4 Task() calls.

## Commits

- `df8b59c`: feat(02-01): extract phase-researcher and plan-checker instructions to skill resources
- `91ea199`: feat(02-01): migrate phase-researcher and plan-checker to general-purpose subagents

## Verification

- Zero `subagent_type="kata-"` patterns in kata-plan-phase
- 4 `subagent_type="general-purpose"` Task() calls (planner x2, researcher x1, checker x1)
- phase-researcher-instructions.md: 645 lines, body matches source verbatim
- plan-checker-instructions.md: 749 lines, body matches source verbatim
- `npm run build:plugin` succeeds

## Deviations

None.
