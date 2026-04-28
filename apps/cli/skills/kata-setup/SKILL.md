---
name: kata-setup
description: "Use when the user asks to install Kata, set up Kata CLI, connect Kata to an agent harness, or check initial Kata configuration."
---

# kata-setup

## Operating Brief

When this skill is invoked, help the user make Kata usable in the current harness and repository.

If the skill is already installed, use the local wrapper for setup and health checks. Explain only the concrete next fix when setup is blocked.

This skill does not initialize project state. It only verifies that the runtime, skill installation, and backend configuration are ready for the requested Kata workflow.

## Success Criteria

- The user knows whether Kata is ready in this harness.
- Runtime health has been checked with `node ./scripts/kata-call.mjs health.check` when the wrapper is available.
- Any blocking setup issue is stated with the exact next action.
- No project, milestone, slice, task, or artifact state is created.

## Do Not

- Do not create or modify project artifacts.
- Do not continue into planning or execution if setup is blocked.
- Do not inspect helper scripts unless the helper command itself fails.
- Do not invent backend-specific setup steps outside the CLI contract.

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
