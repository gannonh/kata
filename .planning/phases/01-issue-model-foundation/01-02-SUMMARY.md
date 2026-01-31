---
phase: "01"
plan: "02"
subsystem: skills
tags: [skill-rename, vocabulary, issue-model]
dependency-graph:
  requires: []
  provides: [checking-issues-skill]
  affects: [01-03, 01-04, 01-05]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified:
    - skills/checking-issues/SKILL.md
decisions: []
metrics:
  duration: 80s
  completed: 2026-01-31
---

# Phase 01 Plan 02: Rename checking-todos to checking-issues Summary

Renamed skill from checking-todos to checking-issues with full vocabulary update from todo terminology to issue terminology.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Rename skill directory | a4635aa | skills/checking-todos/ -> skills/checking-issues/ |
| 2 | Update skill frontmatter and content | 65b69c0 | skills/checking-issues/SKILL.md |

## Outcomes

### Changes Made

1. **Directory renamed:** `skills/checking-todos/` -> `skills/checking-issues/`
2. **Frontmatter updated:**
   - name: checking-todos -> checking-issues
   - description triggers updated with issue vocabulary
3. **Paths updated:**
   - `.planning/todos/pending/` -> `.planning/issues/open/`
   - `.planning/todos/done/` -> `.planning/issues/closed/`
4. **Display vocabulary:** All "todo"/"todos" references replaced with "issue"/"issues"
5. **Actions:** "move to done" -> "move to closed"

### Verification Results

- 0 occurrences of "todo" (case-sensitive) remaining
- 0 references to `.planning/todos/` paths
- 7 references to `.planning/issues/` paths
- User command is `/kata:check-issues`

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

This skill now expects `.planning/issues/open/` and `.planning/issues/closed/` directories, which will be created by plan 01-03 (directory structure migration).
