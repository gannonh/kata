---
name: kata-setup
description: "Bootstrap Kata into Codex, Claude Code, Cursor, Pi, or generic Skills environments. Use this whenever the user asks to install Kata, set it up, connect the CLI, or configure a harness."
workflow: help
runtime_required: false
contract_operations:
  - none
---

# kata-setup

## Canonical Workflow

- Source: `apps/orchestrator/kata/workflows/help.md`

## Setup Hint

Run `npx @kata-sh/cli setup --pi` for Pi harnesses (or `npx @kata-sh/cli setup` for generic detection), then run `npx @kata-sh/cli doctor` before execution.

## Runtime Contract Operations

None. This is a setup-only skill.

## Guardrails

- Use only the typed @kata-sh/cli runtime contract for backend IO.
- Keep backend-specific behavior inside CLI adapters, never in skill logic.
