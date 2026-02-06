---
plan: 02-02
phase: 02-full-conversion
status: complete
started: 2026-02-06T00:17:52Z
completed: 2026-02-06T00:21:25Z
duration: 213s
tasks_completed: 2
tasks_total: 2
commits:
  - hash: 0a9a32b
    message: "feat(02-02): extract 3 agent instructions to kata-add-milestone skill resources"
  - hash: 4ff3e95
    message: "feat(02-02): update kata-add-milestone to use general-purpose subagents"
---

Migrate kata-project-researcher, kata-research-synthesizer, and kata-roadmapper from custom subagents to skill resources in kata-add-milestone.

## Tasks

### Task 1: Extract 3 agent instructions to kata-add-milestone skill resources
- **Status:** Complete
- **Commit:** 0a9a32b
- Extracted body content (no frontmatter) from 3 agent files to `skills/kata-add-milestone/references/`
- project-researcher-instructions.md: 859 lines
- research-synthesizer-instructions.md: 250 lines
- roadmapper-instructions.md: 600 lines

### Task 2: Update kata-add-milestone SKILL.md to inline all 3 agent instructions
- **Status:** Complete
- **Commit:** 4ff3e95
- Added Read calls for 3 instruction files using `${SKILL_BASE_DIR}/references/` path pattern
- Updated all 7 Task() calls from custom subagent types to `general-purpose`
- Prepended `<agent-instructions>` wrapper to each Task() prompt
- Build passes

## Verification

- Zero `subagent_type="kata-*"` patterns in kata-add-milestone
- 7 `subagent_type="general-purpose"` calls confirmed
- All 3 instruction files exist with correct line counts
- `npm run build:plugin` succeeds

## Deviations

None.
