---
name: kata-plan-issue
description: "Use when the user wants to plan a one-off Kata issue, standalone issue, backlog item, bugfix, enhancement, or slice-sized unit of work outside the milestone/slice/task workflow. This skill turns an isolated request into a single issue containing both a design section and an implementation plan section. Use this instead of kata-new-milestone or kata-plan-phase when the work should be planned and executed in isolation rather than as part of an active milestone."
---

# kata-plan-issue

## Operating Brief

When this skill is invoked, help the user turn a standalone request into one durable backlog issue in a backend that supports `issue.create`.

Use a staged planning workflow: explore context, ask focused clarifying questions, propose viable approaches with trade-offs, get approval on one approach, present a visible self-reviewed design for approval, then do planning-depth classification and planning research before presenting a visible self-reviewed implementation plan. Do not create local design or plan markdown files; after both approvals, persist both documents together in one backend issue through `issue.create`.

Use this for slice-sized work that should be planned and executed in isolation, not attached to a milestone roadmap. The created issue body must contain both `# Design` and `# Plan` sections, but do not draft those sections in the same turn as the approach options and do not write the plan immediately after design approval without planning research.

## Success Criteria

- The user chose or approved one approach before seeing the design.
- The design was self-reviewed and a concise self-review summary was shown before design approval.
- The user approved the design before implementation planning began.
- The plan depth was classified as fast, research, or reviewed before plan drafting.
- Planning research was performed at the selected depth before the plan was shown.
- Reviewed-depth plans used a reviewer subagent when available, or an explicit inline reviewer pass otherwise.
- The plan was self-reviewed against the approved design and a concise self-review summary was shown before plan approval.
- The user approved the plan before backend issue creation.
- The planned work is represented by exactly one backlog issue.
- The issue body contains a concise design section and a concrete implementation plan section.
- The plan is small enough for a fresh execution agent to act on without milestone context.
- No milestone, slice, or task state is created.

## Do Not

- Do not create milestones, slices, or tasks.
- Do not split the design and plan across multiple issues.
- Do not write durable local design or plan files for this workflow.
- Do not execute implementation work in this skill.
- Do not one-shot the full design and plan in the same response as the approach options.
- Do not write the plan immediately after design approval without classifying planning depth and doing planning research.
- Do not ask to create the backend issue until the user has approved both the design and the plan.
- Do not use this for roadmap-sized or multi-slice work; route that to kata-new-milestone or kata-plan-phase.

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

Additional references:

- questioning: `references/questioning.md`
- ui-brand: `references/ui-brand.md`

Templates:

- issue-plan: `templates/issue-plan.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
