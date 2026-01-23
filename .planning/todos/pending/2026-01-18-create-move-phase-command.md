---
created: 2026-01-18T16:04
title: Create move-phase command
area: planning
files: []
---

## Problem

Currently there's no command to move a phase to a different position in the roadmap. This is useful when priorities change or when work needs to be reordered.

Use cases:
- Moving a phase earlier when it becomes more urgent
- Moving a phase later when priorities shift
- Reordering phases without manual ROADMAP.md editing
- Avoiding manual renumbering of subsequent phases

Similar to how `phase-insert` creates decimal phases (e.g., 72.1) and `phase-remove` removes phases with renumbering, a `move-phase` command would allow repositioning existing phases.

## Solution

TBD - Need to design:
1. Command interface: `/kata:move-phase <source> <target>` or interactive selection?
2. How to handle phase numbers (renumber all affected phases?)
3. Impact on STATE.md and existing plan files
4. Validation (can't move completed phases, can't move current phase, etc.)
5. Git commit message format for phase moves
6. Whether to preserve phase history or update references

Consider studying `phase-remove` and `phase-insert` implementations for patterns.
