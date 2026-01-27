---
phase: 06-pr-review-workflow-skill-agents
plan: 01
subsystem: skills
tags:
  - pr-review
  - code-quality
  - skill
dependency-graph:
  requires: []
  provides:
    - PR review skill with 6 specialized agents
    - Code quality review workflow for Kata phases
  affects:
    - Phase verification workflows
    - PR creation workflows
tech-stack:
  added: []
  patterns:
    - Skill-based orchestration with reference agents
key-files:
  created:
    - skills/kata-reviewing-prs/SKILL.md
    - skills/kata-reviewing-prs/references/code-reviewer.md
    - skills/kata-reviewing-prs/references/test-analyzer.md
    - skills/kata-reviewing-prs/references/silent-failure-hunter.md
    - skills/kata-reviewing-prs/references/type-design-analyzer.md
    - skills/kata-reviewing-prs/references/comment-analyzer.md
    - skills/kata-reviewing-prs/references/code-simplifier.md
  modified: []
decisions: []
metrics:
  duration: 2 min
  completed: 2026-01-27
---

# Phase 06 Plan 01: PR Review Skill Import Summary

**One-liner:** PR review skill with 6 specialized agents for code quality, tests, errors, types, comments, and simplification.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create skill directory and import reference files | aaf9747 |
| 2 | Create adapted SKILL.md with Kata conventions | e1b2bda |

## Artifacts Created

### skills/kata-reviewing-prs/SKILL.md

PR review orchestration skill with Kata conventions:
- Name: `kata-reviewing-prs` (gerund form per Kata naming)
- Extended trigger phrases for natural language invocation
- Updated usage examples for `/kata:reviewing-prs` (plugin) and `/kata-reviewing-prs` (npx)
- Kata workflow integration section for phase execution hooks
- 6 review aspects: code, tests, errors, types, comments, simplify

### Reference Files (6 agents)

| File | Agent | Focus |
|------|-------|-------|
| code-reviewer.md | Code Reviewer | Project guidelines, bugs, code quality |
| test-analyzer.md | Test Analyzer | Behavioral coverage over line coverage |
| silent-failure-hunter.md | Silent Failure Hunter | Error handling, silent failures |
| type-design-analyzer.md | Type Design Analyzer | Type invariants, encapsulation |
| comment-analyzer.md | Comment Analyzer | Comment accuracy, value assessment |
| code-simplifier.md | Code Simplifier | Code clarity, maintainability |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

### Satisfied for Phase 06 Plan 02

- PR review skill available at `skills/kata-reviewing-prs/`
- Can be invoked via `/kata:reviewing-prs` (plugin) or `/kata-reviewing-prs` (npx)
- All 6 agent reference files in place

### Remaining Work in Phase 06

Phase 06 focuses on PR review workflow skill and agents. This plan completes the core skill import. Additional plans may cover:
- Integration with phase execution workflow
- Automated review triggers
- Custom agent configurations
