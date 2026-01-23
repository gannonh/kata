---
created: 2026-01-18T16:45
title: Change command and subagent naming to noun-verb
area: planning
files:
  - commands/kata/*.md
  - agents/kata-*.md
---

## Problem

Current naming convention uses verb-noun (e.g., `phase-plan`, `phase-execute`, `todos-add`). Consider switching to noun-verb for consistency and clarity (e.g., `phase-plan`, `phase-execute`, `todos-add`).

This would affect:
- All slash commands in `commands/kata/`
- All subagent names in `agents/`
- References throughout workflows and documentation

## Solution

TBD - Requires analysis of:
- Which pattern is more intuitive for discovery (tab completion)
- Impact on existing user muscle memory
- Consistency with Claude Code conventions
- Migration path for existing users
