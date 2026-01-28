---
phase: 07-deprecate-npx-support
plan: 01
subsystem: skills
tags: [refactor, directory-structure, naming]
dependency-graph:
  requires: []
  provides: [skill-directory-renames, clean-skill-names]
  affects: [07-02, 07-03]
tech-stack:
  added: []
  patterns: [plugin-namespace-invocation]
key-files:
  created: []
  modified:
    - skills/adding-milestones/SKILL.md
    - skills/adding-phases/SKILL.md
    - skills/adding-todos/SKILL.md
    - skills/auditing-milestones/SKILL.md
    - skills/checking-todos/SKILL.md
    - skills/completing-milestones/SKILL.md
    - skills/configuring-settings/SKILL.md
    - skills/debugging/SKILL.md
    - skills/discussing-phases/SKILL.md
    - skills/executing-phases/SKILL.md
    - skills/executing-quick-tasks/SKILL.md
    - skills/inserting-phases/SKILL.md
    - skills/listing-phase-assumptions/SKILL.md
    - skills/mapping-codebases/SKILL.md
    - skills/pausing-work/SKILL.md
    - skills/planning-milestone-gaps/SKILL.md
    - skills/planning-phases/SKILL.md
    - skills/providing-help/SKILL.md
    - skills/removing-phases/SKILL.md
    - skills/researching-phases/SKILL.md
    - skills/resuming-work/SKILL.md
    - skills/reviewing-pull-requests/SKILL.md
    - skills/setting-profiles/SKILL.md
    - skills/showing-whats-new/SKILL.md
    - skills/starting-projects/SKILL.md
    - skills/tracking-progress/SKILL.md
    - skills/verifying-work/SKILL.md
decisions: []
metrics:
  duration: 3 min
  completed: 2026-01-27
---

# Phase 07 Plan 01: Rename Skill Directories Summary

**One-liner:** Removed kata- prefix from 27 skill directories; source now matches plugin distribution.

## What Was Done

### Task 1: Rename skill directories and update frontmatter

Renamed all 27 skill directories from `skills/kata-*` to `skills/*` using `git mv`. Updated each SKILL.md frontmatter `name:` field to match the new directory name.

**Files affected:** 27 skill directories (each with SKILL.md and potentially references/)

**Commit:** 09d4688

### Task 2: Update internal Skill() invocations

Found and updated one internal skill-to-skill reference:
- `Skill("kata-reviewing-pull-requests")` -> `Skill("kata:reviewing-pull-requests")`

The plugin namespace format uses colon separator (`:`) rather than hyphen.

**Files modified:** skills/executing-phases/SKILL.md

**Commit:** d3bae36

## Verification Results

| Check | Result |
| ----- | ------ |
| Skill directory count | 27 (kata-updating already deleted) |
| kata- prefixed directories | None |
| kata- prefixed frontmatter | None |
| Plugin build | Success |

## Deviations from Plan

### Unplanned Inclusions

**1. kata-updating already deleted**

The kata-updating skill directory was already removed in a prior staged change. The plan expected 28 total directories (27 renamed + 1 kata-updating), but only 27 exist. This is correct behavior — 07-02 was planned to delete it, but it was already gone.

**2. NPM-related files also removed**

The commit also included removal of:
- `.github/workflows/publish.yml`
- `hooks/kata-check-update.js`
- `hooks/kata-npm-statusline.js`

These were staged changes from prior work. They align with the phase goal (deprecating NPX support) and were scheduled for removal in 07-02.

## Next Phase Readiness

Plan 07-02 can proceed. The skill directories are now in their final form. Build.js transformations (`renameSkillDir()`, `transformSkillName()`) are now no-ops and can be removed.
