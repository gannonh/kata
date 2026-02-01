---
created: 2026-01-18T00:00
title: Update command should check local installation first
area: tooling
files:
  - commands/kata/update.md
---

## Problem

The `/kata:update` command currently assumes Kata is installed globally (in `~/.claude/commands/`). However, Kata can also be installed locally in a project's `./.claude/` directory.

When checking for updates and performing updates, the command should:
1. First check if `./.claude/commands/kata/` exists (local installation)
2. If local, check and update in the local project directory
3. If not local, fall back to global `~/.claude/commands/kata/`

This ensures users with local installations don't accidentally update a global installation or vice versa.

## Solution

Modify `commands/kata/update.md` to:
1. Add a detection step at the start to check `[ -d ./.claude/commands/kata ]`
2. Set install path variable based on detection result
3. Use that path variable throughout the update process
