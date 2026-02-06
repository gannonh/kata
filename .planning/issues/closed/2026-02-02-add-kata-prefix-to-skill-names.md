---
created: 2026-02-02T06:24
title: Add kata- prefix to all skill names
area: tooling
provenance: github:gannonh/kata-orchestrator#82
files:
  - skills/*/SKILL.md
---

## Problem

Skills currently use bare names like `add-milestone`, `plan-phase`, `execute-phase` in their directory and `name` frontmatter fields. The CLAUDE.md documents that skills should use `kata-` prefix (e.g., `kata-plan-phase`), but the actual skill directories and SKILL.md `name` fields don't follow this convention.

This creates inconsistency between:
- Documentation showing `/kata-plan-phase` style invocations
- Actual invocations being `/kata:plan-phase`

27 skills need updating:
- add-issue, add-milestone, add-phase, audit-milestone, check-issues, complete-milestone, configure-settings, debug, discuss-phase, execute-phase, execute-quick-task, help, inserting-phases, list-phase-assumptions, map-codebase, new-project, pause-work, plan-milestone-gaps, plan-phase, remove-phase, research-phase, resume-work, review-pull-requests, set-profile, track-progress, verify-work, whats-new

## Solution

1. Rename each skill directory from `skills/{name}/` to `skills/kata-{name}/`
2. Update `name:` frontmatter in each SKILL.md to include `kata-` prefix
3. Update any internal @-references that use skill names
4. Update CLAUDE.md skill reference table
5. Rebuild plugin and test invocations
