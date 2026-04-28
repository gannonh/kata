---
name: kata-health
description: "Run Kata health diagnostics for the active backend and workflow runtime. Use this when the user asks whether Kata is configured correctly."
workflow: health
runtime_required: true
contract_operations:
  - project.getContext
  - milestone.getActive
  - execution.getStatus
---

# kata-health

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/health.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `milestone.getActive`
- `execution.getStatus`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
