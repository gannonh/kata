---
name: kata-new-milestone
description: "Use when the user wants to create the next milestone, release goal, or scoped delivery target for an existing Kata project."
---

# kata-new-milestone

## Operating Brief

When this skill is invoked, help the user define the next scoped delivery milestone for an existing Kata project.

Start by reading project context, then ask what outcome the next milestone should deliver. Gather enough detail to define the milestone goal, requirements, roadmap, constraints, and open questions.

Create exactly one milestone with `milestone.create`, then write milestone-scoped requirements and roadmap artifacts with `artifact.write`. End by routing the user to `kata-plan-phase`.

## Success Criteria

- Exactly one active milestone is created for the selected delivery goal.
- Milestone requirements are persisted as a milestone-scoped `requirements` artifact.
- The delivery roadmap is persisted as a milestone-scoped `roadmap` artifact.
- The user knows the next step is `kata-plan-phase`.

## Do Not

- Do not initialize a new project here; route missing project context to `kata-new-project`.
- Do not create slices or tasks.
- Do not create multiple milestones unless the user explicitly asks.
- Do not route to standalone discussion skills.

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

- questioning: `references/questioning.md`
- ui-brand: `references/ui-brand.md`

Templates:

- project: `templates/project.md`
- requirements: `templates/requirements.md`
- roadmap: `templates/roadmap.md`
- state: `templates/state.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
