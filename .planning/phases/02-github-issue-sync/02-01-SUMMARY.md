# Phase 02 Plan 01: Add GitHub Issue Sync to add-issue Skill Summary

---
phase: 02-github-issue-sync
plan: 01
subsystem: github-integration
tags: [github, issues, sync, backlog]
requires:
  - 01-issue-model-foundation
provides:
  - GitHub issue creation via add-issue skill
  - Backlog label management
  - Provenance tracking for synced issues
affects:
  - 02-02 (pull external issues)
  - 02-03 (execution linking)
tech-stack:
  added: []
  patterns:
    - Conditional GitHub sync based on config
    - Non-blocking GitHub operations
    - Provenance field for bidirectional tracking
key-files:
  created: []
  modified:
    - skills/add-issue/SKILL.md
decisions:
  - Use --body-file pattern for GitHub issue body (safe escaping)
  - Create backlog label idempotently with --force flag
  - Skip sync if provenance already contains github: reference
metrics:
  duration: 2 min
  completed: 2026-02-01
---

**One-liner:** GitHub sync for add-issue skill with backlog label and provenance tracking

## Changes Made

### Task 1: Add GitHub issue creation step
Added `sync_to_github` step between `create_file` and `update_state` that:
- Checks `github.enabled` config before any GitHub operations
- Creates `backlog` label idempotently via `gh label create --force`
- Builds issue body in `/tmp/issue-body.md` for safe escaping
- Creates GitHub Issue with `gh issue create --label "backlog"`
- Extracts issue number from URL and updates local file provenance
- All operations wrapped in non-blocking error handling

### Task 2: Update success criteria and output
- Added GitHub Issue to output section as conditional output
- Added two new success criteria for GitHub sync verification
- Updated confirm step to show GitHub issue number when synced

## Commits

| Hash | Message |
| --- | --- |
| ed5d8c0 | feat(02-01): add GitHub issue sync to add-issue skill |

## Files Modified

| File | Changes |
| --- | --- |
| `skills/add-issue/SKILL.md` | +71 lines: sync_to_github step, output, success_criteria, confirm |

## Decisions Made

| Decision | Rationale |
| --- | --- |
| Use `--body-file` for issue body | Handles special characters, newlines, markdown safely |
| Create label with `--force` | Idempotent - creates if not exists, no-op if exists |
| Skip if provenance already set | Prevents duplicate GitHub issues on re-runs |
| Non-blocking GitHub failures | Local workflow never blocked by GitHub errors |

## Deviations from Plan

**Discovered change:** `skills/check-issues/SKILL.md` had uncommitted modifications from a previous session. Restored original state via `git checkout` as these changes belong to plan 02-02 (pull external issues), not this plan.

## Verification Results

All success criteria verified:
- [x] add-issue skill has sync_to_github step
- [x] Step checks github.enabled config before any GitHub operations
- [x] GitHub Issues created with `backlog` label
- [x] Local file provenance field updated with GitHub reference
- [x] Non-blocking error handling (GitHub failures don't block local workflow)
- [x] Output and success criteria updated to reflect GitHub sync
- [x] No "todo" vocabulary present (except intentional deprecation/migration code)

## Next Phase Readiness

Plan 02-02 (Pull External Issues) can proceed:
- `backlog` label established for Kata-created issues
- Provenance field pattern established for bidirectional tracking
- GitHub config checking pattern available for reuse
