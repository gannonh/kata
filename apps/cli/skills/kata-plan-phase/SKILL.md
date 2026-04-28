---
name: kata-plan-phase
description: "Plan a Kata phase against the canonical backend contract. Use this whenever the user asks Kata to plan the next slice of work."
workflow: plan-phase
runtime_required: true
contract_operations:
  - project.getContext
  - milestone.getActive
  - slice.list
  - task.list
  - artifact.read
  - artifact.write
---

# kata-plan-phase

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/plan-phase.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `milestone.getActive`
- `slice.list`
- `task.list`
- `artifact.read`
- `artifact.write`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
