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

Use progressive disclosure resources:

- Setup and health checks: `references/setup.md`
- Alignment depth: `references/alignment.md`
- Workflow instructions: `references/workflow.md`
- Runtime IO contract: `references/runtime-contract.md`
- CLI command patterns: `references/cli-runtime.md`
- Artifact conventions: `references/artifact-contract.md`
- CLI helper: `scripts/kata-call.mjs`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
