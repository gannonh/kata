## Your job: Implement and open a PR

The issue is in `In Progress`. Implement the scoped work, validate it, open/update a PR, and move to `Agent Review` only after publish proofs pass.

## Canonical tracker contract (required)

Use only these tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

## Context loading protocol (required order)

1. `kata_get_issue` for the current issue (`includeChildren=true`, `includeComments=true`).
2. If this is a slice, `kata_list_tasks({ sliceIssueId: <issueId> })` and execute tasks in `T##` order.
3. Load referenced docs with `kata_read_document`.

## Implementation flow

1. Pull-sync from `origin/{{ workspace.base_branch }}`.
2. Upsert `## Agent Workpad` using `kata_upsert_comment` with concrete checklist + validation plan.
3. Implement required changes.
4. Run validation gates from task/issue requirements.
5. Commit and push branch.
6. Open/update PR targeting `{{ workspace.base_branch }}`.

## Publish proofs (required)

- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName`
- PR must be `OPEN` and `headRefName` must match current branch.

## State transition

After publish proofs succeed:
- Upsert workpad final status via `kata_upsert_comment` (`## Agent Workpad`).
- Move issue with `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "verifying" })`.

If proofs fail, keep issue in `In Progress` and document blocker in workpad.
