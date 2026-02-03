---
status: complete
phase: 03-issue-roadmap-integration
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-02-02T14:30:00Z
updated: 2026-02-02T15:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Issue Selection in add-milestone
expected: add-milestone SKILL.md contains Phase 7.5 with AskUserQuestion multiSelect: true that lists backlog issues
result: pass
note: Implementation uses two-step flow (Milestone Goal → Backlog Issues) rather than standalone Phase 7.5, but all functionality present

### 2. Milestone Scope Issues Tracking
expected: add-milestone SKILL.md updates STATE.md with "### Milestone Scope Issues" section for selected issues
result: pass

### 3. Issue-Phase Linkage Flow
expected: check-issues SKILL.md "Link to existing phase" adds linked_phase to issue frontmatter and updates STATE.md "### Pending Issues"
result: pass
note: Mechanism works, but UX issue noted — see Gaps section

### 4. Bidirectional Tracking
expected: Issue files get linked_phase in frontmatter, STATE.md gets issue→phase mapping in Pending Issues section
result: pass
note: Mechanism works, UX issue noted — see Gaps section

### 5. source_issue Field Specification
expected: agents/kata-planner.md documents source_issue field with format github:#N or local path in Frontmatter Fields table and dedicated section
result: pass
verified: grep confirms frontmatter example, table entry, and documentation section

### 6. PR Body Source Issues
expected: skills/execute-phase/SKILL.md reads source_issue from plans and includes "Source Issues" section with Closes #X in PR body
result: pass
verified: grep confirms SOURCE_ISSUES loop, Closes #X building, and PR body section

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

### UX Issue: Phase linkage messaging for milestone-scoped issues

**Severity:** minor (UX clarity, not functional)

**Problem:** When an issue has already been pulled into milestone scope (informing requirements → phases), the "Link to existing phase" option in check-issues is confusing. The issue's requirements are already distributed across phases through the normal flow (issue → requirements → roadmap phases).

**User feedback:** Issues should be strategically deconstructed into phases via requirements, which is working correctly. The explicit "Link to existing phase" flow makes sense for NEW issues added mid-milestone, not for issues that already informed the roadmap.

**Suggested fix:** Update check-issues UX messaging to:
- Detect if issue is in "Milestone Scope Issues"
- If so, explain: "This issue's requirements are mapped to Phases X, Y" instead of offering to link
- Or clarify that "Link to existing phase" is for issues NOT already in milestone scope

**Action:** Create backlog issue for UX improvement (not blocking)
