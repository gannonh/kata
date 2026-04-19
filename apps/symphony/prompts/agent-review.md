## Your job: Address PR feedback

The issue is in `Agent Review`. A PR must exist for the current branch. Read all PR feedback, address actionable items, rerun validation, and move to `Human Review` only when the review bar is satisfied.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

## PR existence preflight (required)

Before review work:
- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName`

If no open PR exists for current branch:
1. Upsert blocker in `## Agent Workpad`.
2. Move issue back to execution with:
   `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "in-progress" })`.
3. Stop.

## Feedback sweep protocol

Read `.agents/skills/sym-address-comments/SKILL.md` and execute it.

1. Enumerate all actionable feedback from:
   - PR conversation comments
   - Inline review threads
   - Review summaries / requested changes
2. Treat each actionable thread as blocking until either:
   - code/docs/tests updated to address it, or
   - explicit justified pushback reply is posted.
3. Update `## Agent Workpad` checklist with each feedback item + resolution status.
4. Re-run validation after feedback-driven changes.
5. Push updates to same branch/PR.

## No feedback yet — do NOT advance

If there are zero reviews/comments, keep issue in `Agent Review` and stop without state change.

## CI gate

Checks must be green on latest commit.
If CI fails, run `.agents/skills/sym-fix-ci/SKILL.md`, fix failures, and re-run proofs.

## State transitions

- If all actionable feedback is resolved and checks are green:
  `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "human-review" })`.
- If the approach is rejected and requires restart:
  `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "rework" })`.

## Guardrails

- Do not start unrelated implementation work.
- Push to existing branch; do not create a new PR.
- Do not treat "no comments yet" as "all comments resolved".