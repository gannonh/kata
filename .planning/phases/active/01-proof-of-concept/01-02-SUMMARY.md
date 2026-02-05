---
phase: "01"
plan: "02"
subsystem: orchestration
tags: [subagents, skills, executor, general-purpose, agent-instructions]
dependency-graph:
  requires: ["01-01"]
  provides: ["executor-instructions skill resource", "general-purpose executor pattern for kata-execute-phase"]
  affects: ["02-full-conversion"]
tech-stack:
  added: []
  patterns: ["agent-instructions wrapper for inlined subagent instructions", "general-purpose subagent with explicit prompt content"]
key-files:
  created:
    - skills/kata-execute-phase/references/executor-instructions.md
  modified:
    - skills/kata-execute-phase/SKILL.md
    - skills/kata-execute-phase/references/phase-execute.md
    - skills/kata-execute-phase/references/execute-plan.md
key-decisions:
  - "Verbatim extraction of agent body: no restructuring or improvements"
  - "Model lookup tables updated to show general-purpose (executor) label"
metrics:
  duration: "3 min"
  completed: "2026-02-05"
---

# Phase 1 Plan 2: Migrate Executor to Skill Resource Summary

Executor agent body extracted verbatim (773 lines) to `executor-instructions.md` skill resource; all `kata-execute-phase` Task() calls updated to use `general-purpose` subagent with `<agent-instructions>` wrapper inlining instructions into the prompt.

## What Was Built

1. **executor-instructions.md** (773 lines) -- Full executor agent body content without YAML frontmatter, stored as a skill reference file for runtime Read + inline into Task prompts.

2. **Updated SKILL.md wave_execution** -- All three parallel Task() calls now:
   - Prepend `<agent-instructions>{executor_instructions_content}</agent-instructions>` to prompt
   - Use `subagent_type="general-purpose"` instead of `kata-executor`
   - Read `references/executor-instructions.md` as part of wave preparation

3. **Updated phase-execute.md** -- Checkpoint handling and continuation agent Task() calls updated to `general-purpose` with `<agent-instructions>` wrapper.

4. **Updated execute-plan.md** -- Both autonomous and segmented plan Task() call examples updated to `general-purpose`.

## Verification Results

- `grep -r 'subagent_type="kata-executor"' skills/kata-execute-phase/` returns empty
- 7 `subagent_type="general-purpose"` references across the directory (3 SKILL.md + 2 phase-execute.md + 2 execute-plan.md)
- 3 `agent-instructions` references in SKILL.md
- `npm run build:plugin` passes
- executor-instructions.md: 773 lines, starts with `<role>` tag, no frontmatter

## Decisions Made

1. **Verbatim extraction** -- Copied agent body exactly as-is, no restructuring. Preserves behavior parity with the custom subagent approach.
2. **Model lookup table label** -- Changed from `kata-executor` to `general-purpose (executor)` to preserve model selection documentation while reflecting the new subagent type.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated model lookup tables and prose references in SKILL.md**

- **Found during:** Task 2
- **Issue:** Plan specified updating wave_execution Task() calls and reference files, but SKILL.md also had `kata-executor` in the model lookup table (line 52) and process description (line 162). These would violate the success criterion of "zero references to kata-executor subagent type."
- **Fix:** Updated model lookup table row from `kata-executor` to `general-purpose (executor)` and updated prose in step 4 from "Spawn kata-executor" to "Spawn general-purpose executor."
- **Files modified:** skills/kata-execute-phase/SKILL.md
- **Commit:** 1f691d8

## Files Created/Modified

| Action   | File                                                      | Purpose                                    |
| -------- | --------------------------------------------------------- | ------------------------------------------ |
| Created  | skills/kata-execute-phase/references/executor-instructions.md | Executor agent instructions as skill resource |
| Modified | skills/kata-execute-phase/SKILL.md                        | general-purpose subagent with inlined instructions |
| Modified | skills/kata-execute-phase/references/phase-execute.md     | Updated subagent type in checkpoint/continuation |
| Modified | skills/kata-execute-phase/references/execute-plan.md      | Updated subagent type in execution patterns |

## Performance

- Started: 2026-02-05T21:05:21Z
- Completed: 2026-02-05T21:08:30Z
- Duration: 3 min
- Tasks: 2/2

## Next Phase Readiness

Ready for 01-03 (planner migration). No blockers.
