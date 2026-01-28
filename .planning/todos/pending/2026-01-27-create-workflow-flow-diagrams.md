---
created: 2026-01-27T16:23
title: Create detailed flow diagrams of workflow paths
area: docs
files:
  - skills/*/SKILL.md
  - agents/*.md
  - kata/workflows/*.md
---

## Problem

Kata has multiple interconnected workflow paths (project creation, milestone planning, phase execution, verification, debugging, etc.) but no visual documentation showing how these paths flow and connect. New users and future Claude instances need to understand:

- Entry points for each workflow
- Decision branches and gates
- Agent spawning patterns
- State file updates at each step
- How workflows hand off to each other

Currently this requires reading multiple SKILL.md and agent files to piece together the full picture.

## Solution

Create Mermaid or ASCII flow diagrams documenting:

1. **High-level orchestration flow** — How skills route to agents
2. **Project lifecycle** — new-project → milestones → phases → plans → execution
3. **Planning flow** — research → plan → check → approve loop
4. **Execution flow** — executor waves, checkpoints, deviation handling
5. **Verification flow** — verifier → debugger → UAT paths
6. **PR workflow** — branch → PR → issue sync → review → merge

Place in `kata/references/` or `docs/` for progressive disclosure.
