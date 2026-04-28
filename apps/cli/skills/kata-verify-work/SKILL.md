---
name: kata-verify-work
description: "Use when the user asks to verify, validate, review, demo, or sign off on Kata work."
---

# kata-verify-work

## Operating Brief

When this skill is invoked, verify completed Kata work and record acceptance evidence.

Load the relevant project/task/artifact context, identify the behaviors that must be verified, and walk through them one at a time. Record evidence in verification or UAT artifacts, then update task verification state through the CLI.

If verification fails, report the exact failure and leave the task unverified.

## Success Criteria

- Each relevant behavior has explicit verification evidence.
- A verification or UAT artifact records what was checked and the result.
- Verified tasks are marked with `verificationState: verified`.
- Failed checks are clearly reported without marking tasks verified.

## Do Not

- Do not mark verification complete from confidence alone.
- Do not hide or smooth over failed checks.
- Do not create new execution scope.
- Do not skip artifact updates when verification evidence was gathered.

Use progressive disclosure resources:

- Setup and health checks: `references/setup.md`
- Alignment depth: `references/alignment.md`
- Workflow instructions: `references/workflow.md`
- Runtime IO contract: `references/runtime-contract.md`
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
