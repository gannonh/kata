---
name: kata-execute-phase
description: "Execute a planned Kata phase task-by-task. Use this when the user wants Kata to carry out the plan."
workflow: execute-phase
runtime_required: true
contract_operations:
  - project.getContext
  - milestone.getActive
  - slice.list
  - task.list
  - artifact.read
  - execution.getStatus
---

# kata-execute-phase

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/execute-phase.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `milestone.getActive`
- `slice.list`
- `task.list`
- `artifact.read`
- `execution.getStatus`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
