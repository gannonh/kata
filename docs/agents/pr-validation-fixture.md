# Representative PR validation fixture

## Purpose

Define a reusable PR fixture that supports validation of review comments, push updates, check inspection, and merge-readiness gates.

## Fixture requirements

### Required PR state

- PR is open.
- Base branch is `main`.
- Head branch is a disposable fixture branch for this workflow.
- PR targets a branch that exists on `origin`.

### Representative review and comment signals

- At least one PR conversation comment exists.
- At least one PR review exists.
- At least one review-thread or inline review comment exists.
- Feedback can be inspected with:
  - `.agents/skills/sym-state/scripts/sym-call pr.inspect-feedback --input <payload>`

### Expected check signals

- PR has at least one completed check run.
- PR has at least one required check in a non-failing state before merge-readiness is considered.
- Check status can be inspected with:
  - `.agents/skills/sym-state/scripts/sym-call pr.inspect-checks --input <payload>`

### Branch setup constraints

- Fixture branch is short-lived and scoped to validation work.
- Fixture branch name is unique per run and does not reuse release or production branches.
- Fixture branch history remains auditable through normal commits.

### Safety constraints

- Do not bypass commit hooks with `--no-verify`.
- Do not force-push protected branches.
- Do not merge fixture PRs during validation runs unless explicit merge approval exists.
- Keep all merge checks enforced; use readiness inspection rather than bypass.