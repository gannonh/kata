---
name: kata-execute-phase
description: "Use when the user wants Kata to execute planned phase work or advance tasks in the active milestone."
---

# kata-execute-phase

## Operating Brief

When this skill is invoked, execute planned task work for the active milestone.

Load project context, active milestone, slices, tasks, and the relevant plan artifact. Select executable todo tasks, update their status as work begins, perform the implementation, then persist a summary artifact and mark completed tasks done only after verification evidence exists.

Keep backend state current through `task.updateStatus` and `artifact.write`.

## Success Criteria

- The selected task work is implemented in the repository.
- Task status reflects the real execution state.
- A task or slice summary artifact records what changed and how it was verified.
- Completed tasks are marked done only after verification evidence is available.

## Do Not

- Do not execute tasks without reading the active plan.
- Do not mark work done before verification evidence exists.
- Do not create new milestone scope here.
- Do not leave backend task status stale after beginning or completing work.

Use progressive disclosure resources:

- Setup and health checks: `references/setup.md`
- Alignment depth: `references/alignment.md`
- Workflow instructions: `references/workflow.md`
- Runtime IO contract: `references/runtime-contract.md`
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
