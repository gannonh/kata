---
phase: quick
plan: 007
subsystem: skills
tags: [skill-descriptions, style-guide, imperative-voice]
requires: []
provides: [imperative-verb-skill-descriptions]
affects: []
tech-stack:
  added: []
  patterns: [imperative-voice-descriptions]
key-files:
  created: []
  modified:
    - skills/kata-*/SKILL.md (27 files)
    - dist/plugin/skills/kata-*/SKILL.md (27 files, gitignored)
decisions:
  - id: desc-style
    decision: All skill descriptions start with imperative verbs
    rationale: Matches KATA-STYLE.md imperative voice convention, more direct for Claude matching
metrics:
  duration: 3 min
  completed: 2026-02-03
---

# Quick Task 007: Remove Skill Description Filler Summary

Removed "Use this skill when/to" filler prefix from all 27 skill description fields, replacing with imperative verb forms per KATA-STYLE.md convention.

## What Was Done

Edited the `description:` YAML frontmatter field in all 54 SKILL.md files (27 source + 27 dist) to remove leading filler phrases and start with imperative verbs.

**Transformation patterns applied:**
- "Use this skill to capture" -> "Capture"
- "Use this skill when adding" -> "Add"
- "Use this skill when systematically debugging" -> "Systematically debug"
- "Use this skill to plan" -> "Plan"
- (and 23 more)

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Update all source skill descriptions | f927fd2 | 27 source SKILL.md files |
| 2 | Sync changes to dist/plugin copies | (not tracked) | 27 dist SKILL.md files (gitignored) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] dist/ directory is gitignored**

- **Found during:** Task 2 commit
- **Issue:** dist/plugin/skills/ files are gitignored and not tracked in git. Plan assumed they would be committed.
- **Fix:** Applied edits to dist files for runtime correctness but skipped git commit for dist. Source files (which are committed) are the source of truth; dist is a build artifact.
- **Files modified:** 27 dist/plugin/skills/kata-*/SKILL.md files (modified on disk, not committed)

## Verification Results

- `grep -r "Use this skill" skills/kata-*/SKILL.md` -- zero matches
- `grep -r "Use this skill" dist/plugin/skills/kata-*/SKILL.md` -- zero matches
- Source and dist description fields are identical (diff returns empty)
- All 54 descriptions start with imperative verbs
