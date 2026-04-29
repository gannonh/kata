---
name: kata-verify-work
description: "Use when the user asks to verify, validate, review, or sign off on Kata work."
---

# kata-verify-work

## Operating Brief

When this skill is invoked, verify completed Kata work and record durable evidence.

Load the relevant project snapshot, task, and artifact context, identify the behaviors that must be verified, and walk through them one at a time. Record evidence in verification artifacts, then update task verification state through the CLI. Use UAT artifacts only when the plan explicitly calls for user acceptance testing.

After updating verification state, reload the project snapshot and recommend exactly the snapshot's next workflow. Do not infer milestone completion from verified tasks alone.

## Success Criteria

- Each relevant behavior has explicit verification evidence.
- A verification artifact records what was checked and the result.
- Verified tasks are marked with `verificationState: verified`.
- Failed checks are clearly reported without marking tasks verified.

## Do Not

- Do not mark verification complete from confidence alone.
- Do not hide or smooth over failed checks.
- Do not create new execution scope.
- Do not skip artifact updates when verification evidence was gathered.

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

- ui-brand: `references/ui-brand.md`

Templates:

- UAT: `templates/UAT.md`
- verification-report: `templates/verification-report.md`

## Execution Rules

1. If setup or backend state is uncertain, start with `references/setup.md`.
2. Choose alignment depth using `references/alignment.md` inside this workflow.
3. Follow `references/workflow.md` as the behavioral source for this skill.
4. Use only operations listed in `references/runtime-contract.md` for backend IO.
5. Keep backend specifics in @kata-sh/cli adapters, never in skill logic.
