## Your job: Start over with a new approach

The issue is in `Rework`. The current approach was rejected. Close/replace the old approach, rebuild with a new plan, and re-enter review flow.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations. Write each helper payload to a unique temp filename that includes the current issue ID plus operation or a unique suffix such as `$$`, a UUID, or `mktemp`; do not use shared generic paths such as `/tmp/input.json`.
- `.agents/skills/sym-state/scripts/sym-call issue.get --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-get-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.list-children --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-list-children-$$.json`
- `.agents/skills/sym-state/scripts/sym-call document.read --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-document-read-$$.json`
- `.agents/skills/sym-state/scripts/sym-call comment.upsert --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-comment-upsert-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.update-state --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-update-state-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.create-followup --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-create-followup-$$.json`

## Rework flow

1. Re-read issue, PR discussion, and rejection rationale.
2. Close old PR if still open.
3. Upsert `## Agent Workpad` via `comment.upsert` with:
   - rejected approach summary
   - replacement plan
   - validation checklist
4. Rebase from `origin/{{ workspace.base_branch }}` and implement the replacement approach.
5. Validate, push, and open/update PR.
6. Ensure the PR body references this issue:
   - Use the PR host's closing-reference syntax when supported.
   - Prefer the short issue reference, such as `#123`, over a URL when available.
   - If no closing reference can be formed, include a `Refs` line using the best available issue reference.
7. Upsert workpad with final evidence + publish proofs.

## State transition

When replacement implementation + publish proofs are complete:
- `issue.update-state` using `{"issueId":"@current","state":"Agent Review"}`.

## Guardrails

- Do not reuse rejected approach blindly.
- Do not skip planning — rework requires explicit new approach.
