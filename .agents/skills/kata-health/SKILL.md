---
name: kata-health
description: "Use when the user asks whether Kata is configured correctly, healthy, connected, or ready to run."
---

# kata-health

## Operating Brief

When this skill is invoked, determine whether Kata is configured, connected, and ready.

Run doctor through the local wrapper when available, run `health.check`, then read project context. Report backend identity, repository/project identity, blocking errors, warnings, and the exact next fix if blocked.

This skill diagnoses readiness only.

## Success Criteria

- Runtime health has been checked.
- Project context has been read when health allows it.
- The user knows whether Kata is ready to run.
- Any blocker includes a concrete next action.

## Do Not

- Do not start setup automatically unless the user asked for setup.
- Do not continue into planning or execution when health is blocked.
- Do not inspect helper scripts unless the helper command fails.
- Do not mutate backend project state.

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
