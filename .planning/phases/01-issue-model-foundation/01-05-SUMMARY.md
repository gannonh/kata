---
phase: 01
plan: 05
subsystem: skills
tags:
  - deprecation
  - ux
  - vocabulary
requires:
  - 01-01
  - 01-02
  - 01-03
  - 01-04
provides:
  - deprecation-triggers
  - backward-compatibility
affects:
  - 01-06
tech-stack:
  added: []
  patterns:
    - deprecation-notice-pattern
key-files:
  created: []
  modified:
    - skills/adding-issues/SKILL.md
    - skills/checking-issues/SKILL.md
decisions: []
metrics:
  duration: 2 min
  completed: 2026-01-31
---

# Phase 01 Plan 05: Deprecation Handling Summary

**One-liner:** Friendly deprecation notices for old "todo" vocabulary pointing users to new "issues" commands

## Changes Made

### adding-issues Skill

1. **Description updated** - Added deprecated triggers: "add todo", "capture todo", "new todo"
2. **New deprecation_notice step** - Displays friendly message when old vocabulary detected
3. **Version bumped** - 0.2.0 -> 0.3.0

### checking-issues Skill

1. **Description updated** - Added deprecated triggers: "check todos", "list todos", "pending todos"
2. **New deprecation_notice step** - Displays friendly message when old vocabulary detected
3. **Version bumped** - 0.1.0 -> 0.2.0

## Deprecation Pattern

The deprecation is **non-blocking**:
- Old vocabulary still triggers the correct skill
- User sees a friendly notice: `> **Note:** "todos" is now "issues". Using /kata:add-issue.`
- Workflow continues without interruption

This provides a smooth transition path for users familiar with the old vocabulary.

## Commits

| Hash | Message |
|------|---------|
| e9e2eed | feat(01-05): add deprecation triggers to adding-issues skill |
| 7f0f531 | feat(01-05): add deprecation triggers to checking-issues skill |

## Deviations from Plan

None - plan executed exactly as written.

## Must-Haves Verification

- [x] Old trigger phrases ("add todo", "check todos") still work
- [x] User sees helpful deprecation message pointing to new commands
- [x] Workflow continues without blocking

## Next Phase Readiness

Plan 01-06 (Batch issue operations) can proceed. Deprecation handling is complete and users familiar with "todo" vocabulary will be gently guided to the new "issues" terminology.
