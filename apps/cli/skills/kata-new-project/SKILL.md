---
name: kata-new-project
description: "Create a new Kata project interview and seed milestones. Use this whenever the user wants to start a project with Kata."
workflow: new-project
runtime_required: true
contract_operations:
  - project.getContext
  - artifact.write
---

# kata-new-project

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/new-project.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` once in Pi environments, then verify runtime health with `npx @kata-sh/cli doctor`.

## Runtime Contract Operations

- `project.getContext`
- `artifact.write`

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
