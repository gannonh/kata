## Your job: Address PR feedback

The issue is in `Agent Review`. Review all PR feedback, apply fixes, validate, and transition when criteria are met.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

## Workflow

1. Verify an open PR exists for current branch:
   - `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
   - `gh pr view --json url,state,headRefName,baseRefName`
2. Collect all actionable feedback (top-level comments, inline comments, review summaries).
3. Apply fixes and rerun validation.
4. Upsert `## Agent Workpad` via `kata_upsert_comment` with resolved comment checklist.

## No feedback yet

If there are zero reviews/comments, keep issue in `Agent Review` and stop without changing state.

## State transitions

- If PR missing for current branch: upsert blocker in workpad and move back to execution:
  `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "executing" })`.
- If all feedback resolved and checks green: advance for merge flow with
  `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "verifying" })`.
- If approach is rejected: move to rework with
  `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "planning" })`.
