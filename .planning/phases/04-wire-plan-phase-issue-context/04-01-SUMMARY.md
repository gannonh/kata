---
phase: "04"
plan: "01"
subsystem: kata-orchestration
tags: [plan-phase, issue-context, wiring, gap-closure]
dependency_graph:
  requires: []
  provides: [issue-context-in-planner]
  affects: [kata-planner, plan-execution]
tech_stack:
  added: []
  patterns: [awk-section-parsing, conditional-prompt-building]
key_files:
  created: []
  modified:
    - skills/plan-phase/SKILL.md
decisions:
  - id: conditional-issue-section
    summary: Build issue context section only when issues are linked
    rationale: Empty sections are acceptable but absence of section content indicates no linked issues
metrics:
  duration: 1 min
  completed: 2026-02-02
---

# Phase 04 Plan 01: Wire plan-phase Issue Context Summary

**One-liner:** Added issue extraction from STATE.md Pending/Milestone sections to plan-phase Step 7, passing context to kata-planner for source_issue traceability.

## What Was Built

### Issue Context Extraction (Step 7)

Added subsection "### Extract Linked Issues from STATE.md" that:
- Extracts PHASE_DIR_NAME and PHASE_NUM from the phase directory
- Uses awk to parse STATE.md "### Pending Issues" section for phase-linked issues
- Uses awk to parse STATE.md "### Milestone Scope Issues" section for phase-linked issues
- Combines results into LINKED_ISSUES variable
- Builds ISSUE_CONTEXT_SECTION conditionally (only when issues exist)

```bash
# Key pattern: Match both phase number and full directory name
if ($0 ~ /→ Phase '"${PHASE_NUM}"'-/ || $0 ~ /→ Phase '"${PHASE_DIR_NAME}"'/) {
  print
}
```

### Planner Prompt Integration (Step 8)

Added "Linked Issues (from STATE.md):" section to the planning_context template:
- Positioned after Research and before Gap Closure
- Uses {issue_context_section} placeholder
- Empty string when no issues linked (non-breaking)

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

| File | Change |
| ---- | ------ |
| skills/plan-phase/SKILL.md | Added issue extraction in Step 7, included in Step 8 prompt |

## Commits

| Hash | Type | Description |
| ---- | ---- | ----------- |
| aca614b | feat | Add issue extraction to plan-phase Step 7 |
| 711b6d5 | feat | Include issue context in Step 8 planner prompt |

## Gap Closure

This plan closes **INTEG-03** from the v1.4.1 milestone audit:

> "plan-phase does not read the issue context from STATE.md, causing the source_issue field to never be set in generated PLAN.md files"

With this change:
- Issues linked to phases via check-issues now inform planning
- Issues selected during add-milestone now inform planning
- kata-planner receives issue context and can set source_issue in PLAN.md frontmatter
- PRs can auto-close their source GitHub issues via the traceability chain

## Verification Results

All success criteria met:

- [x] Step 7 extracts linked issues from both STATE.md sections
- [x] Step 7 uses awk with proper section boundaries (### header matching)
- [x] Step 7 matches both phase number and full directory name patterns
- [x] Step 7 builds ISSUE_CONTEXT_SECTION only when issues exist
- [x] Step 8 planning_context template includes Linked Issues section
- [x] Issue context is OPTIONAL - absence does not break planning
- [x] No syntax errors in modified file

## Next Phase Readiness

Phase 4 complete. This was the final plan in the v1.4.1 milestone.

Milestone v1.4.1 Issue Execution is now complete:
- Phase 1: PR Closure with Source Issues
- Phase 2: Issue Execution Workflow
- Phase 3: Issue-Roadmap Integration
- Phase 4: Wire plan-phase Issue Context (gap closure)
