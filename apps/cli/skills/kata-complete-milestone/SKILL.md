---
name: kata-complete-milestone
description: "Use when the user wants to finish, close, ship, archive, or mark the active Kata milestone complete."
---

# kata-complete-milestone

## Operating Brief

When this skill is invoked, close the active release-sized milestone after all milestone slices and tasks are done and verified.

Load the project snapshot and active milestone, list slices, list tasks for each slice when detail is needed, inspect milestone/slice/task artifacts, confirm every required task is done and verified, summarize delivered outcomes, capture retrospective notes, write completion artifacts, and then complete the milestone through `milestone.complete`.

If readiness is uncertain, stop and explain what must be verified or resolved first.

## Success Criteria

- The active milestone has an accepted completion summary.
- Every required slice is done.
- Every required task is done with `verificationState: verified`.
- Completion evidence includes milestone, slice, and task-scoped artifacts.
- Retrospective or archive artifacts are persisted when useful.
- The milestone is completed through `milestone.complete` only after readiness is confirmed.
- The user knows what remains, if anything, after completion.

## Do Not

- Do not complete a milestone with unverified required work.
- Do not invent completion evidence.
- Do not rely only on milestone-level artifacts when task verification artifacts live on task scope.
- Do not create a new milestone here.
- Do not skip the readiness check.

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

- milestone-archive: `templates/milestone-archive.md`
- retrospective: `templates/retrospective.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
