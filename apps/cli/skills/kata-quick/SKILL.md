---
name: kata-quick
description: "Run a short-form Kata task without the full milestone ceremony. Use this for focused one-off work."
workflow: quick
runtime_required: true
contract_operations:
  - project.getContext
  - artifact.write
---

# kata-quick

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/quick.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `artifact.write`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
