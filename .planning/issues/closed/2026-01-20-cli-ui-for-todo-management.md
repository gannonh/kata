---
created: 2026-01-20T21:17:34Z
title: CLI UI for viewing and managing todos
area: ui
type: feature
files:
  - skills/kata-managing-todos/
  - .planning/todos/
---

## Problem

Currently todos are managed through conversational prompts and file operations. A visual CLI UI would make it easier to:
- See all todos at a glance
- Navigate and select todos interactively
- Perform bulk operations (mark complete, archive, etc.)
- Filter/sort by area, type, date

## Solution

Create a CLI UI (TUI) for todo management:

1. **View options:**
   - Table view with columns: title, area, type, created
   - Detail view for selected todo
   - Filter by area/type

2. **Interactive features:**
   - Arrow key navigation
   - Quick actions (Enter to view, d to delete, c to complete)
   - Search/filter input

3. **Implementation approaches:**
   - Could use ink (React for CLI) or blessed/blessed-contrib
   - Or keep it simple with inquirer prompts
   - Consider integration with existing `/kata-managing-todos` skill
