---
created: 2026-02-05T11:08
title: Integrate explorer/challenger brainstorming skill into Kata
area: tooling
type: feature
provenance: github:gannonh/kata-orchestrator#99
files:
  - /Users/gannonhall/.claude/skills/brainstorming-with-explorer-challenger-teams/SKILL.md
---

## Problem

Kata has no built-in capability for structured ideation. When planning new milestones or exploring feature directions, users rely on ad-hoc conversation. The `brainstorming-with-explorer-challenger-teams` skill exists as a standalone personal skill and has proven useful for generating pressure-tested proposals (it was used to generate the kata-retrospective issue). Integrating it into Kata would make brainstorming a first-class workflow stage, available to all Kata users and connected to Kata's planning artifacts.

## Solution

Port the `brainstorming-with-explorer-challenger-teams` skill into the Kata plugin as `kata-brainstorm` (or similar). Key integration points:

- **Context injection**: Auto-feed PROJECT.md, ROADMAP.md, open issues, and recent milestones as project brief input to explorer/challenger agents
- **Output routing**: Write brainstorm reports to `.planning/brainstorm/` (or similar structured location) so they persist as planning artifacts
- **Issue creation**: Offer to convert top proposals into Kata issues via `kata-add-issue`
- **Milestone integration**: Option to feed brainstorm outputs directly into `kata-add-milestone` as candidate requirements

The skill structure (3 explorer/challenger pairs with quick-wins/high-value/radical lenses) works well and can be preserved. The main work is wiring it into Kata's context and artifact system.

### Estimated Effort

1 phase (2-4 plans). Mostly porting existing logic and adding Kata-specific context/output handling.
