---
created: 2026-01-18T17:30
completed: 2026-01-27
title: Integrate PR skill into Kata system
area: tooling
phase: 06
files:
  - /Users/gannonhall/.claude/skills/working-with-pull-requests/SKILL.md
  - /Users/gannonhall/.claude/skills/working-with-pull-requests/creating-workflow.md
  - /Users/gannonhall/.claude/skills/working-with-pull-requests/reviewing-workflow.md
  - /Users/gannonhall/.claude/skills/working-with-pull-requests/merging-workflow.md
---

## Problem

There's an existing `working-with-pull-requests` skill that handles the complete PR lifecycle:
- **Creating**: branch → commit → push → `gh pr create`
- **Reviewing**: identify PR → run review agents → fix issues → update state
- **Merging**: CI checks → confirm ready → `gh pr merge` → checkout main

This skill should be integrated into Kata for seamless phase-level PR workflows (one PR per phase is already a Kata decision).

## Solution

Integrate the PR skill into Kata:
1. Port to `skills/kata-pull-requests/` or similar
2. Coordinate with phase completion (auto-create PR after phase execution?)
3. Connect to verification workflow (run review agents as part of `/kata:phase-verify`?)
4. Consider phase-level PR template with summary of plans executed

Key integration points:
- After `/kata:phase-execute` completes → suggest/create PR
- `/kata:phase-verify` could include PR review
- STATE.md could track PR state per phase

## Resolution

Completed in Phase 6 of v1.1.0 GitHub Integration milestone:
- **Plan 06-01**: Imported PR review skill with 6 specialized agents (kata-reviewing-prs skill)
- **Plan 06-02**: Integrated GitHub PR context detection and scope modifiers
- **Plan 06-03**: Added integration tests for kata-reviewing-prs skill
- **Plan 06-04**: Documentation updates and todo completion

The skill was adapted to Kata's architecture with:
- 6 review agents: CodeReview, Documentation, ErrorHandling, Performance, Security, Testing
- GitHub PR context integration for scope-aware reviews
- Test coverage validating all components
