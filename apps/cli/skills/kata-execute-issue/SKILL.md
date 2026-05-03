---
name: kata-execute-issue
description: "Use when the user wants to execute a standalone Kata issue, one-off issue plan, backlog issue, or isolated implementation plan created by kata-plan-issue. This skill selects or retrieves an open issue from the backend, confirms the issue with the user, then executes its approved plan with fresh subagents and two-stage review per task."
---

# kata-execute-issue

## Operating Brief

When this skill is invoked, execute one standalone backend issue created by kata-plan-issue.

If the user did not provide an issue reference, list open standalone issues with `issue.listOpen` and ask the user to choose. If the user provided an issue number, Kata ID, or partial title, match it against open standalone issues, retrieve the matching issue with `issue.get`, summarize it with a link, and ask for confirmation before execution.

After confirmation, follow subagent-driven development as closely as possible: fresh implementer subagent per task, spec compliance review first, code quality review second, review loops until approved, then the next task. Update the issue status through `issue.updateStatus`.

## Success Criteria

- The selected standalone issue is confirmed by the user before execution starts.
- The issue design and plan are retrieved from the backend, not from a local markdown plan file.
- Each plan task is implemented by a fresh subagent with full task text and curated context.
- Each task passes spec compliance review before code quality review starts.
- Reviewer findings are fixed and re-reviewed before moving to the next task.
- A final whole-change code review runs after all tasks complete.
- The backend issue status reflects real execution state.

## Do Not

- Do not execute without confirming the selected issue with the user.
- Do not load all open issue bodies when listing issues; use `issue.listOpen` summaries first.
- Do not execute milestone slices or tasks here; this skill is for standalone issues only.
- Do not dispatch implementation subagents in parallel.
- Do not skip spec compliance review or code quality review.
- Do not move to the next task while either review has open issues.
- Do not let implementer self-review replace the two required review stages.

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

- ui-brand: `references/ui-brand.md`

Templates:

- implementer-prompt: `templates/implementer-prompt.md`
- spec-reviewer-prompt: `templates/spec-reviewer-prompt.md`
- code-quality-reviewer-prompt: `templates/code-quality-reviewer-prompt.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
