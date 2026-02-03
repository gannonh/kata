---
phase: 02-issue-execution-workflow
plan: 01
subsystem: issue-execution
tags: [quick-task, mode-selection, pr-creation, issue-context]

dependency-graph:
  requires:
    - 01-pr-issue-closure (established PR workflow patterns)
  provides:
    - Mode selection in "Work on it now" action
    - Issue context threading through quick task execution
    - Automatic PR creation with issue closure
  affects:
    - 02-02 (planned execution workflow)

tech-stack:
  patterns:
    - AskUserQuestion for mode selection
    - --issue flag for context passing
    - Conditional PR creation based on pr_workflow config

key-files:
  modified:
    - skills/check-issues/SKILL.md
    - skills/execute-quick-task/SKILL.md

decisions:
  - Mode selection happens BEFORE moving issue to in-progress
  - Quick task mode moves immediately, planned mode stays in open
  - Planned mode displays guidance stub (full workflow in 02-02)

metrics:
  duration: 4 min
  completed: 2026-02-02
---

# Phase 02 Plan 01: Issue Execution Mode Selection Summary

Mode selection in check-issues with quick task routing to execute-quick-task, issue context threading, and PR creation with automatic issue closure.

## What Was Built

### Task 1: Mode Selection in check-issues

Added execution mode selection to the "Work on it now" action:

- **Mode Selection UI**: AskUserQuestion with header "Execution Mode" offering:
  - "Quick task" - Small fix, execute now with commits + PR
  - "Planned" - Create phase or link to existing phase
  - "Put it back" - Return to issue list

- **Quick Task Flow**: Moves issue to in-progress, adds GitHub labels, routes to `/kata:execute-quick-task --issue "$ISSUE_FILE"`

- **Planned Mode Stub**: Displays guidance message for phase planning (full implementation in 02-02)

- **Updated Documentation**: Success criteria, output section, and issue_lifecycle reflect new mode-based workflow

### Task 2: Issue Context in execute-quick-task

Enhanced execute-quick-task with optional issue context and PR creation:

- **Step 1.5**: Parses `--issue` flag, extracts:
  - `ISSUE_FILE` - path to issue file
  - `ISSUE_TITLE` - from frontmatter
  - `ISSUE_NUMBER` - from provenance field
  - `ISSUE_PROBLEM` - from Problem section

- **Step 2 Conditional**: Skips user prompt when issue context provided, uses issue title as description

- **Step 5 Enhancement**: Issue context injected into planner Task prompt

- **Step 7.5 (New)**: PR creation with issue closure
  - `pr_workflow=true`: Creates branch, pushes, creates PR with `Closes #X`
  - `pr_workflow=false`: Closes issue directly via `gh issue close`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | ae2a53c | Add mode selection to "Work on it now" action |
| 2 | 2d28a9a | Enhance execute-quick-task with issue context and PR creation |

## Deviations from Plan

None - plan executed exactly as written.

## Must-Haves Verification

| Requirement | Status |
|-------------|--------|
| Work on it now presents mode selection | PASS - AskUserQuestion with Quick/Planned options |
| Quick task accepts issue context | PASS - --issue flag parsed in Step 1.5 |
| PR includes Closes #X | PASS - PR body contains Closes #${ISSUE_NUMBER} |
| pr_workflow=false closes issue directly | PASS - gh issue close command added |

## Key Links Established

| From | To | Via |
|------|-----|-----|
| skills/check-issues/SKILL.md | skills/execute-quick-task/SKILL.md | `--issue "$ISSUE_FILE"` parameter |
| skills/execute-quick-task/SKILL.md | gh pr create | PR body with `Closes #X` |

## Next Phase Readiness

Plan 02-02 (Planned Execution Workflow) can proceed:
- Mode selection infrastructure in place
- Planned mode stub displays guidance
- Need to implement phase linkage and full planned workflow
