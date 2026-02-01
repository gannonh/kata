---
phase: quick
plan: 004
subsystem: architecture
tags: [skills, commands, deprecation, plugin]
requires: []
provides: [skills-first-architecture, direct-skill-invocation]
affects: [all-skills, plugin-build]
tech-stack:
  removed:
    - commands/kata directory (29 files)
  patterns:
    - skills as primary user interface
key-files:
  modified:
    - skills/*/SKILL.md (27 files - user-invocable: true)
    - scripts/build.js
    - KATA-STYLE.md
    - .planning/STATE.md
  deleted:
    - commands/kata/*.md (29 files)
decisions:
  - id: commands-deprecated
    choice: Remove commands layer, make skills user-invocable
    rationale: Commands were thin wrappers that just invoked skills. With Claude Code native skill system, direct invocation via /kata:skill-name is cleaner.
metrics:
  duration: 4 min
  completed: 2026-02-01
---

# Quick Task 004: Deprecate Slash Commands Summary

Skills are now the primary user interface for Kata workflows, invocable directly via /kata:skill-name.

## What Changed

### Skills Updated (27 files)
- Changed `user-invocable: false` to `user-invocable: true` in all SKILL.md frontmatter
- Removed `<user_command>` tags (26 files had them, reviewing-pull-requests did not)

### Commands Deleted (29 files)
- Removed entire `commands/kata/` directory
- All thin wrapper commands deleted (add-issue, add-phase, add-todo, etc.)

### Build Updated
- Removed `'commands/kata'` from INCLUDES array in `scripts/build.js`
- Plugin build produces working output without commands directory

### Documentation Updated
- KATA-STYLE.md: Replaced "Slash Commands" section with "Skills" section
- KATA-STYLE.md: Updated progressive disclosure hierarchy (Skill replaces Command)
- STATE.md: Logged commands deprecation decision

### Command References Updated to Skill Names (52 files)
Old command names (imperative form) replaced with new skill names (gerund form):

| Old Command | New Skill |
|-------------|-----------|
| `/kata:plan-phase` | `/kata:planning-phases` |
| `/kata:execute-phase` | `/kata:executing-phases` |
| `/kata:new-project` | `/kata:starting-projects` |
| `/kata:check-progress` | `/kata:tracking-progress` |
| `/kata:add-issue` | `/kata:adding-issues` |
| `/kata:check-issues` | `/kata:checking-issues` |
| (and 21 more...) | |

Files updated:
- 27 skill SKILL.md files
- 14 skill reference files
- 11 agent .md files
- CLAUDE.md, README.md, KATA-STYLE.md

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 | ce053db | Make all skills user-invocable |
| 2 | 94af26f | Delete commands layer and update build |
| 3 | b0f0e4e | Update documentation for skills-first architecture |
| 4 | 7469479 | Update all command references to skill names |

## Verification Results

- [x] All 27 skills have `user-invocable: true`
- [x] No skills have `<user_command>` tags
- [x] commands/kata/ directory deleted (29 files)
- [x] build.js INCLUDES no longer has 'commands/kata'
- [x] `npm run build:plugin` succeeds
- [x] dist/plugin/ has no commands/ directory
- [x] KATA-STYLE.md updated
- [x] STATE.md has decision logged
- [x] All /kata: references use gerund skill names

## Deviations from Plan

Additional work: Updated all command references throughout skills/, agents/, and documentation to use the new gerund-form skill names (e.g., `/kata:plan-phase` → `/kata:planning-phases`).

## Impact

Users now invoke Kata skills directly via `/kata:skill-name` instead of through command wrappers. This simplifies the architecture and reduces code duplication. The skill system is now the single source of truth for all Kata workflows.
