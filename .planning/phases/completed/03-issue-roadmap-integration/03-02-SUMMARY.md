---
phase: 03-issue-roadmap-integration
plan: 02
subsystem: planning
tags: [source-issue, traceability, pr-integration, github]
dependency-graph:
  requires: [03-01]
  provides: [source-issue-field, pr-source-closure]
  affects: [planner-workflow, execution-workflow]
tech-stack:
  added: []
  patterns: [frontmatter-metadata, pr-body-template]
key-files:
  created: []
  modified:
    - agents/kata-planner.md
    - skills/execute-phase/SKILL.md
decisions:
  - source_issue format: "github:#N for GitHub, local path for local-only"
  - PR body includes Source Issues section when applicable
metrics:
  duration: 4 min
  completed: 2026-02-02
---

# Phase 03 Plan 02: Source Issue Field and PR Integration Summary

**One-liner:** Added source_issue field to PLAN.md spec and execute-phase PR body integration for automatic issue closure.

## What Was Built

### 1. PLAN.md Source Issue Specification (kata-planner.md)

Extended the PLAN.md frontmatter specification to include the `source_issue` field:

**Frontmatter example:**
```yaml
source_issue: ""            # Optional: github:#N or local file path
```

**Frontmatter Fields table entry:**
| Field          | Required | Purpose                                              |
| -------------- | -------- | ---------------------------------------------------- |
| `source_issue` | No       | Source issue reference (github:#N or local path)     |

**New "Source Issue Frontmatter" section documenting:**
- Format: `github:#76` for GitHub Issues, local path for local-only
- Enables: PRs include `Closes #N` automatically, audit trail, issue tracking
- When to use: Set automatically when plan created from issue via check-issues flow

### 2. Execute-Phase Source Issue Reading (SKILL.md)

**PR Body Creation (Step 4):**
- Collects source_issue references from all plans in phase
- Extracts GitHub issue numbers from `github:#N` format
- Includes "Source Issues" section in PR body with `Closes #X` entries

```bash
# Collect source_issue references from all plans
SOURCE_ISSUES=""
for plan in ${PHASE_DIR}/*-PLAN.md; do
  source_issue=$(grep -m1 "^source_issue:" "$plan" | cut -d':' -f2- | xargs)
  if echo "$source_issue" | grep -q "^github:#"; then
    issue_num=$(echo "$source_issue" | grep -oE '#[0-9]+')
    [ -n "$issue_num" ] && SOURCE_ISSUES="${SOURCE_ISSUES}Closes ${issue_num}\n"
  fi
done
```

**Merge Path (Step 10.6):**
- Backup closure for source issues in case `Closes #X` didn't trigger
- Iterates through all plans, closes any GitHub source issues

```bash
# Close source issues from plans (backup in case Closes #X didn't trigger)
for plan in ${PHASE_DIR}/*-PLAN.md; do
  source_issue=$(grep -m1 "^source_issue:" "$plan" | cut -d':' -f2- | xargs)
  if echo "$source_issue" | grep -q "^github:#"; then
    issue_num=$(echo "$source_issue" | grep -oE '[0-9]+')
    gh issue close "$issue_num" --comment "Closed by PR #${PR_NUMBER} merge (source issue for plan)" 2>/dev/null || true
  fi
done
```

## Key Links Verified

| From | To | Via | Pattern |
| ---- | -- | --- | ------- |
| agents/kata-planner.md | PLAN.md frontmatter | source_issue field spec | `source_issue.*github:#` |
| skills/execute-phase/SKILL.md | gh pr create | Closes #X in PR body | `SOURCE_ISSUES` |

## Commits

| Hash | Type | Description |
| ---- | ---- | ----------- |
| 30c1cb0 | feat | add source_issue to PLAN.md specification |
| 4a53a4e | feat | read source_issue in execute-phase for PR body |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

Phase 03 Plan 02 complete. This provides the specification and reading capability for source_issue. The full traceability flow requires:
- Plan 01 (complete): check-issues can link issues to phases
- Plan 02 (this plan): source_issue field and PR integration
- Future: planner sets source_issue when creating plans from issues

The source_issue field is now documented and execute-phase will include `Closes #X` for any plans that have it set.
