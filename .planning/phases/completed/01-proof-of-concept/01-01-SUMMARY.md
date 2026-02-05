---
phase: 01-proof-of-concept
plan: 01
subsystem: skills-orchestration
tags: [subagents, skills, planner, agent-instructions]

dependency-graph:
  requires: []
  provides:
    - planner-instructions.md skill resource
    - general-purpose subagent pattern for planner Task() calls
  affects:
    - 01-02 (executor migration uses same pattern)
    - 01-03 (remaining Task() calls in kata-plan-phase)
    - Phase 2 (full conversion of all subagents)

tech-stack:
  added: []
  patterns:
    - "agent-instructions wrapper prepended to Task() prompt"
    - "skill resource (references/) for inlined agent body content"
    - "general-purpose subagent type replacing custom subagent lookup"

key-files:
  created:
    - skills/kata-plan-phase/references/planner-instructions.md
  modified:
    - skills/kata-plan-phase/SKILL.md

decisions:
  - id: planner-inline-pattern
    description: "Planner instructions extracted verbatim from agents/kata-planner.md body, stored as skill resource, inlined via agent-instructions wrapper"
    rationale: "Removes custom subagent lookup dependency while preserving exact same instructions"

metrics:
  duration: "~2 min"
  completed: 2026-02-05
---

# Phase 01 Plan 01: Extract Planner Instructions to Skill Resource Summary

Planner agent body extracted verbatim from agents/kata-planner.md to skill resource at references/planner-instructions.md; both kata-planner Task() calls in kata-plan-phase SKILL.md converted to general-purpose subagent with agent-instructions wrapper prepending the instructions content.

## What Was Done

### Task 1: Extract planner instructions to skill resource and update SKILL.md

**Step A** - Created `skills/kata-plan-phase/references/planner-instructions.md` containing the full body (1431 lines) from `agents/kata-planner.md`, excluding YAML frontmatter. Content starts with `<role>` tag, verbatim copy.

**Step B** - Added Read call in step 7 of SKILL.md for `${SKILL_BASE_DIR}/references/planner-instructions.md` with instruction to store content as `planner_instructions_content`.

**Step C** - Updated both planner Task() calls:
- Step 8 (standard planning): `subagent_type="kata-planner"` changed to `subagent_type="general-purpose"`, prompt prepended with `<agent-instructions>` wrapper
- Step 12 (revision mode): Same changes applied

Preserved unchanged:
- `kata-phase-researcher` Task() call at line 234 (Phase 2 scope)
- `kata-plan-checker` Task() call at line 477 (Phase 2 scope)

## Verification Results

| Check | Expected | Actual | Status |
| --- | --- | --- | --- |
| `subagent_type="kata-planner"` count | 0 | 0 | Pass |
| `subagent_type="general-purpose"` count | 2 | 2 | Pass |
| `agent-instructions` references | >= 2 | 2 | Pass |
| `kata-phase-researcher` preserved | 1 | 1 | Pass |
| `kata-plan-checker` preserved | 1 | 1 | Pass |
| planner-instructions.md Read call | exists | exists | Pass |
| planner_instructions_content refs | >= 1 | 3 | Pass |
| planner-instructions.md starts with --- | no | no | Pass |
| planner-instructions.md line count | ~1430+ | 1431 | Pass |
| npm run build:plugin | success | success | Pass |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
| --- | --- |
| 81d2352 | feat(01-01): extract planner instructions to skill resource and update Task() calls |

## Next Phase Readiness

Plan 01-02 can proceed. The pattern established here (extract body to references/, Read in orchestrator step, prepend with agent-instructions wrapper, use general-purpose subagent type) applies directly to the kata-executor migration in plan 01-02.
