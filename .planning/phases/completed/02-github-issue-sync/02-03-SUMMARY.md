---
phase: 02-github-issue-sync
plan: 03
subsystem: check-issues
tags: [github, gh-cli, issues, auto-close, provenance, execution-linking]
requires:
  - 02-02 (GitHub pull for check-issues)
provides:
  - Auto-close GitHub Issue on completion
  - Bidirectional sync loop completion (PULL-02)
  - Execution linking documentation
affects:
  - Future issue management workflows
tech_stack:
  added: []
  patterns: [gh-issue-close, provenance-based-linking, non-blocking-errors]
key_files:
  created: []
  modified:
    - skills/check-issues/SKILL.md
decisions:
  - "GitHub Issue auto-closed with 'Completed via Kata workflow' comment"
  - "Non-blocking error handling - GitHub failures don't block local workflow"
  - "Provenance field is linchpin for bidirectional sync"
metrics:
  duration: 2 min
  completed: 2026-02-01
---

# Phase 02 Plan 03: Execution Linking - Auto-Close Summary

**GitHub-linked issues now auto-close on completion; bidirectional sync loop (ISS-02, PULL-01, PULL-02) is complete with provenance-based linking.**

## What Was Done

### Task 1: Add GitHub close logic (7683ad1)
Added auto-close capability to "Work on it now" action:
- Provenance check: Extract GitHub reference from `provenance: github:owner/repo#N`
- Issue number extraction using grep pattern matching
- `gh issue close --comment "Completed via Kata workflow"` command
- Non-blocking error handling with warning messages
- Handles both local issues (with provenance) and GitHub-only issues

### Task 2: Update confirmation output (7526bb3)
Enhanced user feedback for GitHub operations:
- Confirmation display shows GitHub close status
- Three possible states: "Closed #N", "Not linked", "Failed to close #N"
- Git commit message includes GitHub Issue reference when applicable
- Dynamic GITHUB_REF variable for conditional commit message content

### Task 3: Add execution linking documentation (05ba9a0)
Added `<execution_linking>` block to document the design:
- Explains PULL-02 behavior (auto-close on completion)
- Documents bidirectional sync loop: ISS-02 -> PULL-01 -> PULL-02
- Identifies provenance field as linchpin for deduplication and linking
- Added success criteria for GitHub Issue auto-close

## Key Patterns

### Provenance-Based Linking
```yaml
provenance: github:owner/repo#42
```
The provenance field enables:
1. **Deduplication** - Prevents duplicate issues when pulling from GitHub
2. **Bidirectional updates** - Local completion triggers GitHub close
3. **Traceability** - Git commits reference the GitHub Issue

### Non-Blocking Error Handling
```bash
gh issue close "$ISSUE_NUMBER" --comment "..." 2>/dev/null \
  && echo "Closed GitHub Issue #${ISSUE_NUMBER}" \
  || echo "Warning: Failed to close GitHub Issue #${ISSUE_NUMBER}"
```
GitHub failures produce warnings but don't block local workflow.

### Bidirectional Sync Loop
| Direction | Trigger | Action |
|-----------|---------|--------|
| ISS-02 (Outbound) | `/kata:add-issue` | Creates GitHub Issue, stores provenance |
| PULL-01 (Inbound) | `/kata:check-issues` | Pulls GitHub Issues, creates local files |
| PULL-02 (Completion) | "Work on it now" | Closes both local and GitHub Issue |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- [x] Provenance check in "Work on it now" action
- [x] `gh issue close --comment` command present (2 locations)
- [x] Non-blocking error handling with warnings
- [x] Confirmation output shows GitHub status
- [x] Git commit message references GitHub Issue closure
- [x] Documentation block explains execution linking

## Success Criteria Status

- [x] "Work on it now" checks issue provenance for GitHub reference
- [x] GitHub Issue closed automatically when local issue moved to closed/
- [x] Completion comment added to GitHub Issue for traceability
- [x] Non-blocking error handling (GitHub failures don't block local workflow)
- [x] Confirmation output shows GitHub close status
- [x] Git commit message references GitHub Issue closure
- [x] Documentation block explains execution linking design

## Phase Readiness

Phase 02 (GitHub Issue Sync) is complete. All three plans executed:
- 02-01: GitHub sync for add-issue (ISS-01, ISS-02)
- 02-02: GitHub pull for check-issues (PULL-01)
- 02-03: Execution linking - auto-close (PULL-02)

The bidirectional sync loop is fully operational.
