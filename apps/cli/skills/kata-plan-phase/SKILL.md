---
name: kata-plan-phase
description: "Use when the user asks to plan a phase, slice upcoming work, or turn a milestone goal into executable Kata tasks."
---

# kata-plan-phase

## Operating Brief

When this skill is invoked, turn the active milestone roadmap into executable slices and tasks.

Load project context and the active milestone, read the milestone requirements and roadmap, then present the phase or slice you plan to convert into execution work. Ask for confirmation before creating backend slices or tasks.

Create a slice with `slice.create`, create focused tasks with `task.create`, and write a slice-scoped plan artifact with `artifact.write`. End by routing the user to `kata-execute-phase`.

## Success Criteria

- The selected milestone work is represented by one or more backend slices.
- Each task is small enough for a fresh execution agent and includes verification expectations.
- A slice-scoped `plan` artifact captures the execution plan.
- The user knows the next step is `kata-execute-phase`.

## Do Not

- Do not plan without an active milestone.
- Do not create tasks that are not tied to milestone requirements.
- Do not skip the phase gate before creating backend work.
- Do not execute implementation work in this skill.

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

- phase-prompt: `templates/phase-prompt.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
