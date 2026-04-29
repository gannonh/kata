---
name: kata-execute-phase
description: "Use when the user wants Kata to execute planned phase work or advance tasks in the active milestone."
---

# kata-execute-phase

## Operating Brief

When this skill is invoked, execute one approved slice for the active milestone.

Load the project snapshot, active milestone, slices, tasks, and the relevant plan artifact. Select the next executable slice from snapshot state, get explicit execution approval if the slice is still in Backlog, update statuses as work begins, complete every executable task in the slice, commit task-scoped repository changes atomically when code changed, then persist summary artifacts and mark completed tasks done with verification still pending.

Keep backend state current through `slice.updateStatus`, `task.updateStatus`, and `artifact.write`.

## Success Criteria

- Every executable task in the selected slice is implemented in the repository or explicitly left in progress with failure evidence.
- Any repository changes for the task are committed in one task-scoped atomic commit before the task is marked done.
- Task status reflects the real execution state.
- A task or slice summary artifact records what changed and what execution checks passed.
- Completed tasks remain pending verification until `kata-verify-work` verifies them.

## Do Not

- Do not execute tasks without reading the active plan.
- Do not stop after one task when additional executable tasks remain in the approved slice.
- Do not mark work done before execution-check evidence exists.
- Do not set `verificationState: verified`; `kata-verify-work` owns verification.
- Do not create new milestone scope here.
- Do not leave backend task status stale after beginning or completing work.

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

Additional references:

- ui-brand: `references/ui-brand.md`

Templates:

- summary: `templates/summary.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
