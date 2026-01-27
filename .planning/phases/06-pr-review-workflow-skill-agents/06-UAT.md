# Phase 06 User Acceptance Testing

**Phase:** 06 - PR Review Workflow Skill & Agents
**Started:** 2026-01-27
**Status:** In Progress

## Test Cases

Derived from SUMMARY.md deliverables across 3 plans.

### Plan 01: PR Review Skill Frontmatter

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 1 | Command accessible via slash menu | `/kata:review-pr` appears in slash command menu and invokes skill | ✅ | |
| 2 | context: fork in frontmatter | Skill YAML contains `context: fork` | ✅ | Verified: line 6 |

**Issue Found:** SUMMARY.md claims `user-invocable: false` was removed, but skill still has it. SUMMARY inaccurate.

### Plan 02: PR Review Integration in Phase Execution

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 3 | PR review step in kata-executing-phases | Step 10.6 offers review after `gh pr ready` | ✅ | Line 368 |
| 4 | Three review options | AskUserQuestion offers: full review, quick review, skip | ✅ | Lines 373-378 |
| 5 | Review agents in model lookup | Model lookup table includes review agent entries | ✅ | Lines 56-59 |

### Plan 03: Test Coverage and Documentation

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 6 | PR review skill test exists | `tests/skills/reviewing-pull-requests.test.js` file exists | ✅ | File exists |
| 7 | README documents PR review | README.md contains "### PR Review" section with agent table | ✅ | Lines 342, 355 |

### Manual UAT: PR Review Workflow Integration

| # | Test | Expected | Status | Notes |
|---|------|----------|--------|-------|
| 8 | Backlog todo prompt after fixes | After fixing critical issues, prompt to create todos for suggestions | ❌ | Suggestions displayed but not actionable |
| 9 | Merge prompt before next phase | Primary next action should be "merge PR" not "discuss phase 2" | ❌ | Workflow suggests next phase before PR merged |

## Summary

- **Total tests:** 9
- **Passed:** 7
- **Failed:** 2
- **Pending:** 0

## Issues Found

### Issue 1: No backlog todo prompt for suggestions (Severity: Medium)
**Location:** kata-executing-phases Step 10.6 / PR review flow
**Expected:** After fixing critical issues, ask "Create backlog todos for the N suggestions?"
**Actual:** Suggestions are displayed in summary table but user has no way to capture them for later

### Issue 2: No merge prompt before next phase (Severity: High)
**Location:** kata-executing-phases offer_next (Route A)
**Expected:** After PR marked ready, primary action should be "Merge PR #N" or at minimum block next phase until merged
**Actual:** Output says "ready for review" then immediately suggests "/kata:discuss-phase 2"

## Documentation Note

SUMMARY.md for Plan 01 claims `user-invocable: false` was removed, but the skill still has this field. This is correct behavior (skill should be agent-only, command is user-facing), but the SUMMARY is misleading. Minor documentation inaccuracy — not a functional issue.

---
*UAT session started: 2026-01-27*
*UAT completed: 2026-01-27*
*Status: 2 issues found, needs fix plans*
