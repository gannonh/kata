---
name: kata-setup
description: "Use when the user asks to install Kata, set up Kata CLI, connect Kata to an agent harness, or check initial Kata configuration."
---

# kata-setup

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
