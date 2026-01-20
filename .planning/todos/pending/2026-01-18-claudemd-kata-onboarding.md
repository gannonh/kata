---
created: 2026-01-18T17:28
title: Add Kata section to CLAUDE.md during new-project onboarding
area: planning
files:
  - commands/kata/new-project.md
  - kata/workflows/new-project.md
---

## Problem

When onboarding a new project with Kata, there's no explanation in CLAUDE.md that project management and orchestration is handled by Kata. Future Claude sessions may not know:
- That Kata commands exist
- Where to find planning files
- How the project/milestone/phase/plan hierarchy works
- That they should use Kata workflows instead of ad-hoc approaches

## Solution

As part of `/kata:new-project`, add or update CLAUDE.md with a Kata section explaining:
- Project uses Kata for project management and orchestration
- Key commands: `/kata:progress`, `/kata:plan-phase`, `/kata:execute-phase`
- Planning files location: `.planning/`
- Hierarchy: PROJECT.md → milestones → phases → plans
- Reference to full Kata docs if installed globally

Could be a template block that gets inserted/appended to existing CLAUDE.md.
