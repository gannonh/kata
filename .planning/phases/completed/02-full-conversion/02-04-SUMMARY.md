---
phase: 02-full-conversion
plan: 04
status: complete
started: 2026-02-06T00:18:31Z
completed: 2026-02-06T00:20:31Z
duration: ~2 min
commits:
  - hash: d8f870f
    message: "feat(02-04): migrate kata-integration-checker to skill resource"
---

# Plan 02-04 Summary: Migrate kata-integration-checker

## What Was Done

Migrated kata-integration-checker from custom subagent to skill resource in kata-audit-milestone.

### Task 1: Extract integration-checker instructions and update kata-audit-milestone

- Extracted agent body (424 lines, no frontmatter) to `skills/kata-audit-milestone/references/integration-checker-instructions.md`
- Added Read instruction for the instruction file before the Task() call
- Updated Task() call: `subagent_type="kata-integration-checker"` changed to `subagent_type="general-purpose"` with `<agent-instructions>` wrapper prepended to prompt
- Model selection logic unchanged

## Key Files

| File | Change |
| ---- | ------ |
| `skills/kata-audit-milestone/references/integration-checker-instructions.md` | Created (424 lines, full agent body) |
| `skills/kata-audit-milestone/SKILL.md` | Updated Task() call to general-purpose with agent-instructions |

## Verification

- integration-checker-instructions.md: 424 lines, no frontmatter (first line is blank, not `---`)
- Zero `subagent_type="kata-*"` in kata-audit-milestone
- One `subagent_type="general-purpose"` in kata-audit-milestone
- Two `agent-instructions` references (open + close tags)
- `npm run build:plugin` passes
