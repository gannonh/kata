---
created: 2026-01-20T18:13:45Z
title: Improve skill recall with hooks and rules
area: tooling
type: improvement
files:
  - hooks/
  - .claude/rules/
  - skills/
---

## Problem

Claude doesn't consistently check available skills before responding to prompts. This leads to missed opportunities to use specialized skills and inconsistent behavior.

## Solution

Two-pronged approach:

1. **Install a hook** that reminds Claude to check skills before responding to any user prompt
   - Hook triggers on prompt submission
   - Injects reminder to scan available skills for relevance

2. **Install rules** for skill loading decisions
   - Define conditions/triggers for when to load which skills
   - Create a skill-matching heuristic in `.claude/rules/`
   - Prioritize Kata skills over generic alternatives (already in global CLAUDE.md)
