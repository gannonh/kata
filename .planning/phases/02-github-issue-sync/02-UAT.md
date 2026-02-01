# UAT: Phase 02 - GitHub Issue Sync

**Phase:** 02-github-issue-sync
**Started:** 2026-02-01
**Status:** Complete

## Design Change

During UAT, identified that the original design was fundamentally flawed:
- **Problem:** "Work on it now" moved issues directly to `closed/` and closed GitHub Issues immediately
- **Expected:** GitHub Issues should only close when work is COMPLETE, not when started

**New Design (commit 3ade669):**
```
open/        → Backlog (not started)
in-progress/ → Actively being worked on (NEW state)
closed/      → Completed
```

- "Work on it now" → moves to `in-progress/`, does NOT close GitHub
- "Mark complete" (new) → moves to `closed/`, closes GitHub Issue
- GitHub also auto-closes via "Closes #N" in PR on merge

## Test Cases (First Pass)

### Plan 01: Add-Issue GitHub Sync

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1 | Create issue with github.enabled=true | GitHub Issue created with `backlog` label | ✓ PASS |
| 2 | Local file has provenance after sync | `provenance: github:owner/repo#N` in frontmatter | ✓ PASS |
| 3 | GitHub failures don't block local | Warning shown, local issue still created | SKIP |

### Plan 02: Check-Issues GitHub Pull

| # | Test | Expected | Result |
|---|------|----------|--------|
| 4 | GitHub Issues appear in list | Issues with `backlog` label show [GH] indicator | ✓ PASS |
| 5 | Deduplication works | Synced issues don't appear twice (local + [GH]) | ✓ PASS |
| 6 | Pull to local creates file | Local file created with provenance field | ✗ FAIL (fixed e3679f6) |

### Plan 03: Execution Linking (REDESIGNED)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 7 | Work on issue moves to in-progress | Issue in `in-progress/`, GitHub still open | ✓ PASS |
| 8 | Mark complete closes GitHub | GitHub Issue closed with completion comment | ✓ PASS |
| 9 | Confirmation shows GitHub status | Output mentions "Closed #N" or "Not linked" | ✓ PASS |

## Issues Found

1. **gh CLI --label flag broken** (e3679f6): `gh issue list --label backlog` returns nothing. Fixed by using jq filter instead.
2. **Wrong lifecycle design** (3ade669): GitHub Issues closed on "start work" instead of "complete". Redesigned with `in-progress/` state.
3. **Missing in-progress label on GitHub** (UAT): When "Work on it now" moves issue to `in-progress/`, should also add `in-progress` label to GitHub Issue (keeping `backlog` label too).

## Progress

First pass: 5/6 tested (1 fail fixed, 1 skip)
Second pass: Tests 7-9 passed after redesign

**Final: 8/9 passed, 1 skipped**

## Enhancement Request

Issue #3 logged as enhancement: Add `in-progress` label to GitHub Issues when "Work on it now" is used. This is not a bug but a workflow improvement request.

---
*UAT completed 2026-02-01*
