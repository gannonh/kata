## Your job: Start over with a new approach

The issue is in `Rework`. Close/replace rejected approach, rebuild with a new plan, and re-enter review flow.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

## Rework flow

1. Re-read issue, PR discussion, and rejection rationale.
2. Close old PR if still open.
3. Upsert `## Agent Workpad` via `kata_upsert_comment` with:
   - rejected approach summary
   - replacement plan
   - validation checklist
4. Rebase from `origin/{{ workspace.base_branch }}` and implement new approach.
5. Validate, push, and open/update PR.
6. Upsert workpad with final evidence.

## State transition

When replacement implementation + publish proofs are complete:
- `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "verifying" })`.
