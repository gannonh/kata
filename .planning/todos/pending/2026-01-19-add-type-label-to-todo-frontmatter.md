---
created: 2026-01-19T07:55
title: Add type label to todo frontmatter
area: tooling
files:
  - commands/kata/todos-add.md
---

## Problem

Todos currently have `area` as a classification field, but there's no way to distinguish between different kinds of work: bugs, features, improvements, refactors, etc.

Adding a `type` field to the frontmatter would enable:
- Better triage when reviewing pending todos
- Filtering by type in `/kata:todos-lists`
- More informative todo summaries in STATE.md

## Solution

Update the todos-add command to:
1. Add a `type` field to the frontmatter template
2. Infer type from context or ask user (bug, feature, improvement, refactor, docs, chore)
3. Include type in confirmation output
