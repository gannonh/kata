---
phase: 03-issue-roadmap-integration
plan: 01
subsystem: skills
tags: [issues, milestones, roadmap, phase-linkage]
dependency_graph:
  requires: [02-issue-execution-workflow]
  provides: [issue-selection-in-milestones, issue-phase-linkage]
  affects: [add-milestone-workflow, check-issues-workflow, state-tracking]
tech_stack:
  patterns: [multiSelect-AskUserQuestion, bidirectional-linkage, STATE.md-sections]
key_files:
  modified:
    - skills/add-milestone/SKILL.md
    - skills/check-issues/SKILL.md
decisions: []
metrics:
  duration: 4min
  completed: 2026-02-02
---

# Phase 03 Plan 01: Issue-Roadmap Bidirectional Linking Summary

**One-liner:** Added issue selection to milestone scope definition and completed phase linkage tracking in check-issues.

## What Was Built

### Task 1: Issue Selection in add-milestone

Added "Phase 7.5: Issue Selection" between Research Decision and Define Requirements phases.

**Implementation:**
- Check for backlog issues in `.planning/issues/open/`
- Present AskUserQuestion with `multiSelect: true` for issue selection
- Format options as `"[title]" - [area], [age]` with GitHub ref if linked
- Include "None - Start fresh" option
- Track selected issues in STATE.md under "### Milestone Scope Issues"
- Selected issues inform requirements generation in Phase 8

**File:** `skills/add-milestone/SKILL.md` (+79 lines)

### Task 2: Phase Linkage in check-issues

Enhanced "Link to existing phase" flow to properly track issue-phase associations.

**Implementation:**
- Add `linked_phase` field to issue file frontmatter via awk
- Create/update "### Pending Issues" section in STATE.md
- Track linkage with: issue title, file path, GitHub ref (if linked), timestamp
- Handle edge case: warn if issue already linked to different phase, offer override
- Works for both local issues and GitHub-only issues (after pull-to-local)

**File:** `skills/check-issues/SKILL.md` (+172 lines)

## Key Patterns Established

1. **Bidirectional Linkage:** Issues know their linked phase (frontmatter), STATE.md knows which issues are linked to phases
2. **Milestone Scope Issues:** New STATE.md section tracks issues pulled into current milestone scope
3. **Pending Issues:** STATE.md section tracks issues linked to future phases for planned work

## Commits

| Hash | Description |
| ---- | ----------- |
| 91c75de | feat(03-01): add issue selection to add-milestone |
| 3eb9901 | feat(03-01): complete check-issues phase linkage |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Verification

- [x] add-milestone presents backlog issues during milestone scope definition
- [x] User can select multiple issues to formally include in milestone scope
- [x] Selected issues are tracked in STATE.md under "### Milestone Scope Issues"
- [x] check-issues "Link to existing phase" updates STATE.md properly
- [x] Issue files track their linked phase in frontmatter
- [x] Both skills remain functional with existing features
