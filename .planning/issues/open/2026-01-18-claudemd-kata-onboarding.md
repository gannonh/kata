---
created: 2026-01-18T17:28
title: Add Kata section to CLAUDE.md during project-new onboarding
area: planning
files:
  - commands/kata/project-new.md
  - kata/workflows/project-new.md
---

## Problem

When onboarding a new project with Kata, there's no explanation in CLAUDE.md that project management and orchestration is handled by Kata. Future Claude sessions may not know:
- That Kata commands exist
- Where to find planning files
- How the project/milestone/phase/plan hierarchy works
- That they should use Kata workflows instead of ad-hoc approaches

## Solution

As part of `/kata:project-new`, add or update CLAUDE.md with a Kata section explaining:
- Project uses Kata for project management and orchestration
- Key commands: `/kata:project-status`, `/kata:phase-plan`, `/kata:phase-execute`
- Planning files location: `.planning/`
- Hierarchy: PROJECT.md → milestones → phases → plans
- Reference to full Kata docs if installed globally

Could be a template block that gets inserted/appended to existing CLAUDE.md.
