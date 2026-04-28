---
name: kata-progress
description: "Use when the user asks for Kata project status, milestone progress, task progress, or execution state."
---

# kata-progress

## Operating Brief

When this skill is invoked, report current Kata project and milestone progress.

Read project context, active milestone, slices, tasks, artifacts, and execution status. Summarize what is active, what is blocked, what is done, and the next recommended action.

This is a reporting skill. It should not mutate backend state.

## Success Criteria

- The user sees the current project/backend identity.
- The active milestone, slices, tasks, artifacts, and execution state are summarized.
- Blocking issues and next actions are clear.
- No backend state is changed.

## Do Not

- Do not create or update project artifacts.
- Do not change task or milestone status.
- Do not proceed into execution from a status request.
- Do not omit blockers or warnings.

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

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
