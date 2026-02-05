---
phase: 02-github-issue-sync
plan: 04
subsystem: issue-management
tags: [github, labels, bidirectional-sync, check-issues]
dependency-graph:
  requires: [02-01, 02-02, 02-03]
  provides: [in-progress-label-sync]
  affects: []
tech-stack:
  added: []
  patterns: [idempotent-label-creation, additive-labeling]
key-files:
  created: []
  modified:
    - skills/check-issues/SKILL.md
decisions: []
metrics:
  duration: 1 min
  completed: 2026-02-01
---

# Phase 02 Plan 04: In-Progress Label Sync Summary

Added GitHub `in-progress` label sync when "Work on it now" is used on an issue with GitHub provenance.

## One-liner

Work-on-it-now action adds in-progress label to GitHub Issue via gh issue edit --add-label, keeping backlog label intact.

## Changes Made

### Task 1: Add in-progress label sync to check-issues skill

**Files modified:** `skills/check-issues/SKILL.md`

**Changes:**
1. Added GitHub label sync logic to "Work on it now (open local issue)" path:
   - Extracts provenance field from moved file
   - Checks for github: prefix
   - Creates in-progress label idempotently (`gh label create ... || true`)
   - Adds in-progress label via `gh issue edit --add-label`
   - Outputs status message

2. Added GitHub label sync logic to "Work on it now (GitHub-only issue)" path:
   - Same idempotent label creation
   - Same `gh issue edit --add-label` pattern
   - Uses existing `$ISSUE_NUMBER` from pull-to-local step

3. Updated confirmation messages to show label status:
   - "Linked to #[number], added in-progress label" for GitHub-linked issues
   - "Not linked" for issues without provenance

4. Added success criteria item:
   - "Work on it now" adds in-progress label to GitHub Issue (if linked)

## Key Patterns

- **Idempotent label creation**: `gh label create ... || true` ensures label exists without error
- **Additive labeling**: Uses `--add-label` not `--remove-label`, keeping backlog label intact
- **Conditional execution**: Only runs if `github.enabled=true` in config

## Verification

- [x] `gh label create "in-progress"` appears in both paths (lines 330, 367)
- [x] `gh issue edit --add-label "in-progress"` appears in both paths (lines 333, 371)
- [x] Confirmation messages updated in both paths (lines 347, 383)
- [x] Success criteria checklist updated

## Commits

| Hash    | Message                                           |
| ------- | ------------------------------------------------- |
| dc0cd26 | feat(02-04): add in-progress label sync to check-issues skill |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

This is a gap closure plan. Phase 02 is now complete with full bidirectional sync:
- Create issue -> GitHub Issue created with backlog label
- Work on issue -> in-progress label added (this plan)
- Complete issue -> GitHub Issue closed

Ready to proceed to Phase 03 or UAT verification.
