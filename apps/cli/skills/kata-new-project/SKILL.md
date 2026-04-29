---
name: kata-new-project
description: "Use when the user wants to start, define, import, or initialize a Kata project."
---

# kata-new-project

## Operating Brief

When this skill is invoked, help the user initialize durable Kata project context.

Start conversationally. If the user has not already provided enough detail, ask: "What do you want to build?" Follow their thread until you can explain the project, why it matters, who it is for, what done looks like, and what is explicitly out of scope.

Before durable writes, run `node ./scripts/kata-call.mjs health.check`. Then confirm the synthesized project brief with the user, run `project.upsert`, and write project-scoped artifacts with `artifact.write`.

This skill captures project-level context only; milestone scope and roadmap creation happen next in `kata-new-milestone`.

## Success Criteria

- The project exists in the backend through `project.upsert`.
- A project-scoped `project-brief` artifact captures what is being built, core value, users, context, constraints, decisions, and open questions.
- A project-scoped `requirements` artifact is written when concrete requirement hypotheses emerged.
- The user knows the next step is `kata-new-milestone`.

## Do Not

- Do not create milestones, slices, or tasks.
- Do not write durable state outside the CLI backend contract.
- Do not route to standalone discussion skills.
- Do not skip questioning when the project idea is vague.

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

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
