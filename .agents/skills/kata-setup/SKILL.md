---
name: kata-setup
description: "Use when the user asks to install Kata, set up Kata CLI, connect Kata to an agent harness, or check initial Kata configuration."
---

# kata-setup

## Operating Brief

When this skill is invoked, help the user make Kata usable in the current harness and repository.

If the skill is already installed, use the local wrapper for setup and health checks. Explain only the concrete next fix when setup is blocked.

This skill does not initialize project state. It only verifies that the runtime, skill installation, and backend configuration are ready for the requested Kata workflow.

## Success Criteria

- The user knows whether Kata is ready in this harness.
- Runtime health has been checked with `node ./scripts/kata-call.mjs health.check` when the wrapper is available.
- Any blocking setup issue is stated with the exact next action.
- No project, milestone, slice, task, or artifact state is created.

## Do Not

- Do not create or modify project artifacts.
- Do not continue into planning or execution if setup is blocked.
- Do not inspect helper scripts unless the helper command itself fails.
- Do not invent backend-specific setup steps outside the CLI contract.

## Process

1. Read `references/workflow.md` before taking action. Execute that workflow end-to-end.
2. Preserve every workflow gate: required checks, user confirmations, durable writes, status updates, and next-step routing.
3. Before any backend IO, read `references/runtime-contract.md` and use only the operations listed there.
4. When the workflow tells you to create or read an artifact, use `references/artifact-contract.md` and the named template files.
5. If setup or backend readiness is uncertain, read `references/setup.md` before proceeding.
6. Read optional references only when the workflow calls for them or the current step needs them.

## Resource Loading

Must read:

- Workflow: `references/workflow.md`
- Runtime IO contract: `references/runtime-contract.md`

Read when needed:

- Setup and health checks: `references/setup.md`
- Alignment depth: `references/alignment.md`
- CLI command patterns: `references/cli-runtime.md`
- Artifact conventions: `references/artifact-contract.md`
- CLI helper: `scripts/kata-call.mjs`
- Artifact input helper: `scripts/kata-artifact-input.mjs`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
