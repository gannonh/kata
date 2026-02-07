---
phase: 33-skills-sh-distribution
plan: 01
subsystem: skills-frontmatter
tags: [agent-skills-spec, frontmatter, skills-ref, normalization]
requires: []
provides:
  - spec-compliant-skill-frontmatter
  - skills-ref-validation-test
affects:
  - 33-02 (skills.sh distribution relies on spec-compliant skills)
tech-stack:
  added: [skills-ref]
  patterns: [agent-skills-spec-frontmatter]
key-files:
  created:
    - none
  modified:
    - skills/kata-add-issue/SKILL.md
    - skills/kata-add-milestone/SKILL.md
    - skills/kata-add-phase/SKILL.md
    - skills/kata-audit-milestone/SKILL.md
    - skills/kata-check-issues/SKILL.md
    - skills/kata-complete-milestone/SKILL.md
    - skills/kata-configure-settings/SKILL.md
    - skills/kata-debug/SKILL.md
    - skills/kata-discuss-phase/SKILL.md
    - skills/kata-execute-phase/SKILL.md
    - skills/kata-execute-quick-task/SKILL.md
    - skills/kata-help/SKILL.md
    - skills/kata-insert-phase/SKILL.md
    - skills/kata-list-phase-assumptions/SKILL.md
    - skills/kata-map-codebase/SKILL.md
    - skills/kata-migrate-phases/SKILL.md
    - skills/kata-move-phase/SKILL.md
    - skills/kata-new-project/SKILL.md
    - skills/kata-pause-work/SKILL.md
    - skills/kata-plan-milestone-gaps/SKILL.md
    - skills/kata-plan-phase/SKILL.md
    - skills/kata-remove-phase/SKILL.md
    - skills/kata-research-phase/SKILL.md
    - skills/kata-resume-work/SKILL.md
    - skills/kata-review-pull-requests/SKILL.md
    - skills/kata-set-profile/SKILL.md
    - skills/kata-track-progress/SKILL.md
    - skills/kata-verify-work/SKILL.md
    - skills/kata-whats-new/SKILL.md
    - tests/build.test.js
decisions:
  - name-mismatch-fix: kata-insert-phase name field updated to match directory name (spec requirement)
metrics:
  duration: 4m
  completed: 2026-02-06
---

# Phase 33 Plan 01: Normalize SKILL.md Frontmatter Summary

All 29 SKILL.md files normalized to Agent Skills spec (agentskills.io) portable frontmatter format with skills-ref validation test added to CI.

## What Was Done

### Task 1: Batch-normalize all 29 SKILL.md files

Removed three Claude Code extension fields from all skill frontmatters:
- `user-invocable: true` (29 files, default when absent)
- `disable-model-invocation: false` (27 files, default when absent)
- `context: fork` (1 file: kata-review-pull-requests)

Converted `allowed-tools` from YAML list format to space-delimited string in 28 files. kata-help was already in the correct format for `allowed-tools` but had the other extension fields.

Net reduction: 212 lines of redundant frontmatter removed across 29 files.

### Task 2: Add skills-ref spec validation test

Added `Agent Skills spec validation` describe block to `tests/build.test.js`. The test runs `npx skills-ref validate` against every `kata-*` skill directory and fails if any skill has non-compliant frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] kata-help was NOT already compliant**
- **Found during:** Task 1
- **Issue:** Plan stated kata-help was already spec-compliant. It had `user-invocable: true` and `disable-model-invocation: false` in its frontmatter (pre-existing unstaged modification in working tree had already fixed `allowed-tools` format but not the other fields).
- **Fix:** Included kata-help in the normalization. All 29 files processed, not 28.
- **Commit:** 8a0599f

**2. [Rule 1 - Bug] kata-insert-phase name mismatch**
- **Found during:** Task 2 (skills-ref validate caught it)
- **Issue:** Directory name `kata-insert-phase` did not match `name: kata-insert-phase` in frontmatter. Agent Skills spec requires directory name = skill name.
- **Fix:** Updated name field to `kata-insert-phase` to match directory.
- **Files modified:** skills/kata-insert-phase/SKILL.md
- **Commit:** 6a38762

## Commits

- `8a0599f`: feat(33-01): normalize all SKILL.md frontmatter to Agent Skills spec
- `6a38762`: test(33-01): add Agent Skills spec validation via skills-ref

## Decisions Made

| Decision                                      | Rationale                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Fix kata-insert-phase name to match directory | Agent Skills spec requires directory name = skill name; directory is the canonical identifier |
| Include kata-help in normalization            | Had non-compliant fields despite plan claiming compliance                                     |

## Verification Results

- `grep -r "^user-invocable:" skills/` returns empty
- `grep -r "^disable-model-invocation:" skills/` returns empty
- `grep -r "^context:" skills/` returns empty
- `npm test` passes (35/35 tests including new spec validation)
- `npm run build:plugin` succeeds
- `npx skills-ref validate skills/kata-plan-phase` exits 0
- All 29 skills pass `skills-ref validate`
