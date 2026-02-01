---
created: 2026-01-18T17:26
title: Separate project-new from first milestone creation
area: planning
files:
  - commands/kata/project-new.md
  - commands/kata/milestone-new.md
  - kata/workflows/project-new.md
---

## Problem

Currently `/kata:project-new` creates phases without an explicit milestone. The milestone is implicit, which conflates two concerns:
1. **Project configuration** - big picture stuff, PROJECT.md, overall vision
2. **First milestone** - concrete deliverable with phases

This makes the workflow confusing and couples project-level decisions with milestone-level planning.

## Solution

Split the workflow:
1. `/kata:project-new` becomes purely about configuration:
   - Project name, description, vision
   - PROJECT.md creation
   - Initial .planning/ structure
   - No phases created here

2. Immediately after project-new, prompt to create first milestone:
   - `/kata:milestone-new` creates the first milestone with phases
   - All phases belong to an explicit milestone
   - Cleaner mental model: project → milestones → phases → plans
