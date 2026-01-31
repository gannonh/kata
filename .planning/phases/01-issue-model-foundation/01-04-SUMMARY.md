---
phase: 01
plan: 04
subsystem: skills
tags: [vocabulary, refactor, issue-model]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [updated-secondary-skills]
  affects: [user-documentation, help-system]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - skills/executing-phases/SKILL.md
    - skills/tracking-progress/SKILL.md
    - skills/verifying-work/SKILL.md
    - skills/providing-help/SKILL.md
    - skills/resuming-work/references/resume-project.md
decisions: []
metrics:
  duration: 2 min
  completed: 2026-01-31
---

# Phase 1 Plan 04: Update Secondary Skill References Summary

**One-liner:** Updated 6 secondary skill files from "todo" to "issue" vocabulary for ISS-01 vocabulary consistency.

## What Was Done

Updated vocabulary across all secondary skill files that reference the todo/issue system:

### Task 1: executing-phases skill
- Changed "Create todos" to "Create issues" in backlog options
- Updated `/kata:add-todo` to `/kata:add-issue` command reference
- Updated output template from "todos created" to "issues created"

### Task 2: Secondary skills batch update
- **tracking-progress:** Updated pending count path from `.planning/todos/` to `.planning/issues/`, renamed section "Pending Todos" to "Pending Issues", updated command reference to `/kata:check-issues`
- **verifying-work:** Updated backlog creation to use `/kata:add-issue`, changed "todos created" to "issues created" in output templates
- **providing-help:** Renamed "Todo Management" section to "Issue Management", updated all command references and directory paths
- **resume-project:** Updated pending issues paths and command references throughout

### Preserved References
- `TODOS_CREATED` internal variable name kept (programming identifier)
- `auditing-milestones` code TODO references preserved (refers to code anti-patterns, not Kata system)

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 1e9575b | refactor | Update executing-phases skill from todo to issue vocabulary |
| a1f9727 | refactor | Update secondary skills from todo to issue vocabulary |

## Verification Results

All must_haves verified:
- No "todo" vocabulary remains in user-facing text (13 internal refs acceptable)
- Commands reference `/kata:add-issue` and `/kata:check-issues`
- Help text describes the issue system
- Progress tracking shows "Pending Issues" section

## Deviations from Plan

None - plan executed exactly as written.
