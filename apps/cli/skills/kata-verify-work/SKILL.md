---
name: kata-verify-work
description: "Verify completed Kata work through explicit UAT and checks. Use this when the user asks to validate the work."
workflow: verify-work
runtime_required: true
contract_operations:
  - project.getContext
  - task.list
  - artifact.list
  - artifact.read
  - execution.getStatus
---

# kata-verify-work

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/verify-work.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `task.list`
- `artifact.list`
- `artifact.read`
- `execution.getStatus`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
