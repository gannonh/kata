---
name: kata-health
description: "Use when the user asks whether Kata is configured correctly, healthy, connected, or ready to run."
---

# kata-health

## Operating Brief

When this skill is invoked, determine whether Kata is configured, connected, and ready.

Run doctor through the local wrapper when available, run `health.check`, then read project context. Report backend identity, repository/project identity, blocking errors, warnings, and the exact next fix if blocked.

This skill diagnoses readiness only.

## Success Criteria

- Runtime health has been checked.
- Project context has been read when health allows it.
- The user knows whether Kata is ready to run.
- Any blocker includes a concrete next action.

## Do Not

- Do not start setup automatically unless the user asked for setup.
- Do not continue into planning or execution when health is blocked.
- Do not inspect helper scripts unless the helper command fails.
- Do not mutate backend project state.

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
