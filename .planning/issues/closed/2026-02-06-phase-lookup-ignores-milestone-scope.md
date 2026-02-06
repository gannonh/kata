---
created: 2026-02-06T06:49
title: Phase lookup ignores milestone scope causing collisions
area: planning
provenance: github:gannonh/kata-orchestrator#102
files:
  - skills/kata-plan-phase/SKILL.md
  - kata/workflows/phase-planning.md
---

## Problem

When a user runs `/kata-plan-phase 1` on a new milestone, the phase directory lookup scans all of `.planning/phases/{active,pending,completed}/` without filtering by current milestone. If a previous milestone also had a Phase 1 (e.g., `01-foundation` from v0.1.0), the lookup matches the old phase instead of creating a new one for the current milestone.

This breaks per-milestone phase numbering (adopted 2026-02-03). Completed phases from earlier milestones remain in `.planning/phases/completed/` with the same `01-*` prefix, causing name collisions.

Observed in kata-context project: `/kata-plan-phase 1` for v0.3.0 matched `01-foundation` from v0.1.0 instead of creating v0.3.0's Phase 1 (Infrastructure + Policy Foundation).

## Solution

Two possible approaches:

1. **Milestone-scoped directories:** Store phases under `.planning/phases/{milestone}/` (e.g., `.planning/phases/v0.3.0/active/01-infrastructure/`). Requires updating all phase lookup logic.

2. **Archive completed milestones:** When a milestone completes, move its phases out of the lookup path (e.g., to `.planning/milestones/v0.1.0/phases/`). Keeps current structure but adds a cleanup step.

Either way, the phase lookup in plan-phase, execute-phase, and related skills needs to scope queries to the current milestone from STATE.md.
