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

## Disposable PR setup path

Use this flow to create a short-lived fixture PR that exercises comment, update, and check workflows.

1. Sync and branch from `main`:

   ```bash
   git fetch origin
   git checkout main
   git pull --ff-only origin main
   git checkout -b fixture/pr-validation-$(date +%Y%m%d-%H%M%S)
   ```

2. Add a small auditable change and commit:

   ```bash
   mkdir -p docs/agents/fixtures
   printf "fixture run: %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > docs/agents/fixtures/pr-validation-run.md
   git add docs/agents/fixtures/pr-validation-run.md
   git commit -m "chore: create disposable PR validation fixture"
   ```

3. Push the fixture branch and open the PR to `main`:

   ```bash
   git push -u origin "$(git branch --show-current)"
   gh pr create \
     --base main \
     --title "chore: disposable PR validation fixture" \
     --body "Refs #492"
   ```

4. Add representative PR feedback signals:

   ```bash
   gh pr comment --body "Fixture comment: validates conversation comment ingestion."
   ```

5. Update the branch once to validate push/update behavior:

   ```bash
   printf "update: %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> docs/agents/fixtures/pr-validation-run.md
   git add docs/agents/fixtures/pr-validation-run.md
   git commit -m "chore: fixture PR update commit"
   git push
   ```

Required setup outcomes:

- PR is open against `main`.
- Fixture branch exists on `origin`.
- PR contains at least one comment and at least one update push.
- Standard checks run under normal repository gate rules.

## Validation handoff for Planned Slice 15

Use the fixture PR from this document as the validation target for review and land workflow slices.

### Handoff workflow

1. Confirm fixture branch and PR are published:

   ```bash
   git ls-remote --exit-code --heads origin "$(git branch --show-current)"
   gh pr view --json url,state,headRefName,baseRefName
   ```

2. Inspect PR feedback payload:

   ```bash
   INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-pr-inspect-feedback-$$.json"
   jq -n '{}' > "$INPUT"
   .agents/skills/sym-state/scripts/sym-call pr.inspect-feedback --input "$INPUT"
   ```

3. Inspect PR check payload:

   ```bash
   INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-pr-inspect-checks-$$.json"
   jq -n '{includeLogs:false}' > "$INPUT"
   .agents/skills/sym-state/scripts/sym-call pr.inspect-checks --input "$INPUT"
   ```

4. Inspect land-readiness summary without merging:

   ```bash
   INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-pr-land-status-$$.json"
   jq -n '{includeLogs:false}' > "$INPUT"
   .agents/skills/sym-state/scripts/sym-call pr.land-status --input "$INPUT"
   ```

5. Record observed PR feedback, check status, and land-readiness fields in the active issue workpad.

### Downstream acceptance criteria

- `gh pr view` reports `state` as `OPEN`, `baseRefName` as `main`, and `headRefName` equal to the fixture branch.
- `pr.inspect-feedback` returns non-empty representative feedback signals.
- `pr.inspect-checks` returns check suites and required checks in non-failing status for readiness validation.
- `pr.land-status` can be read successfully and used for decisioning without performing a merge.
- No safety gate bypass commands are used during validation.