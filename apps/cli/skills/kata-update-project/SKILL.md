---
name: kata-update-project
description: "Use when the user wants to update an in-flight Kata project, refresh project artifacts, revise the current milestone, adjust requirements or roadmap context, or pause work to record ad hoc project direction changes. This skill interactively updates durable project and active milestone artifacts without creating new execution scope."
---

# kata-update-project

## Operating Brief

When this skill is invoked, help the user pause in-flight work and update durable Kata project or active milestone artifacts.

Start interactively by loading current project context and asking what the user wants to update: overall project context, current milestone requirements, current milestone roadmap, both project and milestone artifacts, or another named artifact. Read the existing artifacts before drafting changes, preserve unchanged sections and IDs, show a concise update review, then write only confirmed artifact replacements through `artifact.write`.

This skill updates artifact content only. If the requested change needs milestone metadata, slice/task status changes, issue creation, execution, verification, or milestone completion, stop and route to the appropriate workflow.

## Success Criteria

- The requested project or active milestone update target is explicit before writing.
- Existing artifacts are read before any replacement is drafted.
- The user sees and approves a concise diff-style summary of target artifacts, planned changes, and unchanged sections.
- Confirmed updates are persisted through `artifact.write`.
- Project-level updates preserve durable project context unless the user explicitly changes it.
- Milestone updates preserve existing requirement IDs, roadmap labels, backend slice IDs, dependencies, and traceability unless the user explicitly changes them.
- The final output reports changed artifacts and the reloaded snapshot's recommended next workflow when available.

## Do Not

- Do not create milestones, slices, tasks, issues, or milestone completions.
- Do not execute implementation work.
- Do not update task verification state.
- Do not overwrite artifacts without reading the current artifact body first.
- Do not silently change requirement meaning, roadmap dependencies, backend slice IDs, or completed evidence.
- Do not use this skill for read-only status reporting; route that to `kata-progress`.

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
