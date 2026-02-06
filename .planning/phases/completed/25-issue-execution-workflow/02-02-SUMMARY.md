---
phase: 02-issue-execution-workflow
plan: 02
subsystem: issue-execution
tags: [planned-mode, phase-creation, phase-linking, roadmap-integration]

dependency-graph:
  requires:
    - 02-01 (mode selection infrastructure)
  provides:
    - Full planned execution workflow
    - Phase creation routing from issues
    - Phase linking for existing phases
  affects:
    - 02-03 (roadmap integration)

tech-stack:
  patterns:
    - AskUserQuestion for planned execution options
    - UPCOMING_PHASES detection for incomplete phases
    - STATE.md linkage tracking

key-files:
  modified:
    - skills/check-issues/SKILL.md

decisions:
  - "Create new phase" routes to /kata:add-phase rather than inline creation
  - Issues remain in open/ until phase work begins (not moved to in-progress)
  - Phase linkage noted in STATE.md for planning reference

metrics:
  duration: 2 min
  completed: 2026-02-02
---

# Phase 02 Plan 02: Planned Execution Workflow Summary

Planned mode options with "Create new phase" and "Link to existing phase" paths for issues requiring roadmap integration.

## What Was Built

### Task 1: Planned Mode Options

Expanded the "Planned" mode stub to provide full planned execution options:

- **Planned Execution UI**: AskUserQuestion with header "Planned Execution" offering:
  - "Create new phase" - Add a phase to the roadmap for this issue
  - "Link to existing phase" - Associate with an upcoming phase
  - "Put it back" - Return to issue list

- **Create New Phase Flow**:
  - Extracts issue title and GitHub issue number (if linked)
  - Displays "Next Up" guidance routing to `/kata:add-phase ${ISSUE_TITLE}`
  - Notes that issue remains in open/ until phase work begins
  - Clear instructions for fresh context window

- **Link to Existing Phase Flow**:
  - Discovers incomplete phases via UPCOMING_PHASES detection
  - Scans `.planning/phases/*/` for phases with plans but missing summaries
  - Extracts phase goal from ROADMAP.md for display
  - Allows user to select a phase or go back
  - Notes linkage in STATE.md under "### Pending Issues"
  - Handles "no phases found" case with alternatives

- **Both Local and GitHub-only Paths**: Updated both local issue and GitHub-only issue branches with identical planned execution logic

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8a04b76 | Implement planned mode options with phase creation and linking |

## Deviations from Plan

None - plan executed exactly as written.

## Must-Haves Verification

| Requirement | Status |
|-------------|--------|
| Planned mode offers Create new phase option | PASS - AskUserQuestion with option |
| Planned mode offers Link to existing phase option | PASS - AskUserQuestion with option |
| Create new phase routes to /kata:add-phase with issue context | PASS - Next Up guidance with command |
| Link to existing phase shows matching phases | PASS - UPCOMING_PHASES detection |

## Key Links Established

| From | To | Via |
|------|-----|-----|
| skills/check-issues/SKILL.md | /kata:add-phase | "Create new phase" routing |
| skills/check-issues/SKILL.md | STATE.md | Phase linkage tracking |
| skills/check-issues/SKILL.md | .planning/phases/*/ | UPCOMING_PHASES discovery |

## Next Phase Readiness

Plan 02-03 (Roadmap Integration) can proceed:
- Planned execution workflow complete
- Issues can be linked to phases via both creation and association
- STATE.md tracking ready for roadmap integration
