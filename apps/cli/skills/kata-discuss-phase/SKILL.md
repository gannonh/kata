---
name: kata-discuss-phase
description: "Discuss a Kata phase before planning. Use this when the user wants to lock decisions before the plan."
workflow: discuss-phase
runtime_required: true
contract_operations:
  - project.getContext
  - milestone.getActive
  - artifact.read
  - artifact.write
---

# kata-discuss-phase

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/discuss-phase.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `milestone.getActive`
- `artifact.read`
- `artifact.write`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
