---
phase: 01
plan: 01
subsystem: skills
tags: [vocabulary, refactoring, issue-model]
dependency-graph:
  requires: []
  provides: [adding-issues-skill]
  affects: [01-02, 01-03, 01-04, 01-05, 01-06]
tech-stack:
  added: []
  patterns: [issue-vocabulary, open-closed-states]
key-files:
  created: []
  modified: [skills/adding-issues/SKILL.md]
decisions:
  - id: ISS-VOC-01
    decision: Use "open/closed" for issue states instead of "pending/done"
    rationale: Aligns with GitHub issue terminology
metrics:
  duration: 3 min
  completed: 2026-01-31
---

# Phase 1 Plan 01: Rename adding-todos to adding-issues Summary

Renamed the adding-todos skill to adding-issues with vocabulary replacement (todo -> issue) and path updates (.planning/todos/ -> .planning/issues/ with open/closed states).

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Rename skill directory | fd0b231 | skills/adding-todos/ -> skills/adding-issues/ |
| 2 | Update skill frontmatter and content | 735f08f | skills/adding-issues/SKILL.md |

## Key Changes

1. **Directory renamed:** `skills/adding-todos/` -> `skills/adding-issues/`
2. **Frontmatter updated:**
   - `name: adding-issues`
   - Description triggers updated for "issue" vocabulary
   - Version bumped to 0.2.0
3. **Vocabulary replaced:** All "todo" -> "issue", "todos" -> "issues"
4. **Paths updated:**
   - `.planning/todos/pending/` -> `.planning/issues/open/`
   - `.planning/todos/done/` -> `.planning/issues/closed/`
5. **Commit format updated:** `docs(issue):` instead of `docs:`
6. **Provenance field added:** Optional field to track issue origin (local, github:owner/repo#N, etc.)

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

```
$ ls -la skills/adding-issues/SKILL.md
-rw-r--r-- 1 gannonhall staff 5487 Jan 31 08:51 skills/adding-issues/SKILL.md

$ grep -ci "\.planning/todos/" skills/adding-issues/SKILL.md
0

$ grep -c "\.planning/issues/" skills/adding-issues/SKILL.md
9
```

## Must Haves Checklist

- [x] Skill directory is skills/adding-issues/
- [x] Frontmatter name is "adding-issues"
- [x] All paths reference .planning/issues/ (open/ and closed/)
- [x] No "todo" vocabulary remains
- [x] User command is /kata:add-issue

## Next Phase Readiness

Ready for plan 01-02 (rename checking-todos to checking-issues).
