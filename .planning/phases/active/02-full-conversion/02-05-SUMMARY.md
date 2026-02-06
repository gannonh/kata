---
phase: 02-full-conversion
plan: 05
status: complete
started: 2026-02-06T00:18:56Z
completed: 2026-02-06T00:21:52Z
duration: ~3 min
commits:
  - hash: 487e747
    message: "feat(02-05): extract debugger, verifier, codebase-mapper instructions to skill resources"
  - hash: d4a442b
    message: "feat(02-05): migrate kata-debug and kata-execute-quick-task to general-purpose subagents"
artifacts_created:
  - skills/kata-debug/references/debugger-instructions.md
  - skills/kata-verify-work/references/verifier-instructions.md
  - skills/kata-track-progress/references/codebase-mapper-instructions.md
artifacts_modified:
  - skills/kata-debug/SKILL.md
  - skills/kata-execute-quick-task/SKILL.md
---

# Plan 02-05 Summary: Debugger, Quick-Task, and Remaining Extractions

## What Was Done

### Task 1: Extract Agent Instructions to Skill Resources

Extracted body content (everything after YAML frontmatter) from 3 agent files into corresponding skill reference directories:

- `agents/kata-debugger.md` → `skills/kata-debug/references/debugger-instructions.md` (1196 lines)
- `agents/kata-verifier.md` → `skills/kata-verify-work/references/verifier-instructions.md` (771 lines)
- `agents/kata-codebase-mapper.md` → `skills/kata-track-progress/references/codebase-mapper-instructions.md` (731 lines)

Created `references/` directories for kata-debug and kata-track-progress (kata-verify-work already had one).

All files verified: no frontmatter leakage, no YAML fields (tools:, color:, model:), content starts with `<role>` tag.

### Task 2: Migrate Skills to General-Purpose Subagents

**kata-debug/SKILL.md:**
- Added read instruction for `references/debugger-instructions.md` (Step 3)
- Migrated 2 Task() calls from `subagent_type="kata-debugger"` to `subagent_type="general-purpose"`
- Prepended `<agent-instructions>` wrapper to both Task() prompts
- Renumbered process steps (3→4, 4→5, 5→6)

**kata-execute-quick-task/SKILL.md:**
- Added read instructions for cross-skill references: `skills/kata-plan-phase/references/planner-instructions.md` and `skills/kata-execute-phase/references/executor-instructions.md`
- Migrated planner Task() call from `subagent_type="kata-planner"` to `subagent_type="general-purpose"`
- Migrated executor Task() call from `subagent_type="kata-executor"` to `subagent_type="general-purpose"`
- Prepended `<agent-instructions>` wrapper to both Task() prompts

## Verification

- Zero `subagent_type="kata-*"` references in kata-debug/
- Zero `subagent_type="kata-*"` references in kata-execute-quick-task/
- 2 `subagent_type="general-purpose"` in kata-debug/SKILL.md
- 2 `subagent_type="general-purpose"` in kata-execute-quick-task/SKILL.md
- All 3 instruction files exist with correct line counts
- `npm run build:plugin` succeeds
