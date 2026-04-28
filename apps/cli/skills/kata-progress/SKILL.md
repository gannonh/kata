---
name: kata-progress
description: "Summarize live Kata progress against milestone and slice state. Use this when the user asks for project status."
workflow: progress
runtime_required: true
contract_operations:
  - project.getContext
  - milestone.getActive
  - slice.list
  - task.list
  - execution.getStatus
---

# kata-progress

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/progress.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `milestone.getActive`
- `slice.list`
- `task.list`
- `execution.getStatus`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
