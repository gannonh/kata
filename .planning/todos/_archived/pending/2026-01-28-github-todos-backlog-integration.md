---
created: 2026-01-28
title: GitHub todos/backlog integration
area: github-integration
priority: high
---

## Problem

For projects with GitHub integration enabled, todos are stored locally in `.planning/todos/` while phases/milestones are tracked as GitHub Issues/Milestones. This creates dual sources of truth.

## Solution

When `github.enabled=true`:
- Todos become GitHub Issues with `backlog` label
- Remove local todo storage for GitHub-enabled projects
- Update skills: adding-todos, checking-todos, completing-todos

## Context

Deferred from v1.3.0 milestone. See also: `.planning/todos/pending/2026-01-26-github-issues-as-todos.md` for detailed implementation notes.
