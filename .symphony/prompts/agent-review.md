## Your job: Address PR feedback

The issue is in `Agent Review`. A PR must exist for the current branch. Read all PR feedback, address actionable items, rerun validation, and move to `Human Review` only when the review bar is satisfied.

## Helper usage

Use the direct Symphony helper contract from the system prompt. Write each helper payload to a unique temp file.

Common operations for this state:

```bash
"$SYMPHONY_BIN" helper issue.get --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper comment.upsert --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper issue.update-state --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper pr.inspect-feedback --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
"$SYMPHONY_BIN" helper pr.inspect-checks --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

## PR existence preflight

Before review work:

- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName`

If no open PR exists for current branch:

1. Upsert blocker in `## Agent Workpad`.
2. Move issue back to execution with `issue.update-state` using `{"issueId":"@current","state":"In Progress"}`.
3. Stop.

## Feedback sweep protocol

1. Inspect PR feedback with `pr.inspect-feedback`.
   - Use input `{"pr":"<number-or-url>"}` for an explicit PR.
   - Omit `pr` to inspect the current branch PR.
2. Enumerate all actionable feedback from:
   - PR conversation comments
   - Inline review threads
   - Review summaries and requested changes
3. For each feedback item, choose one mode:
   - accept and implement
   - clarify when ambiguity blocks progress
   - push back with a concise rationale when the suggestion conflicts with the issue intent or repo constraints
4. Treat each actionable thread as blocking until either code/docs/tests are updated or an explicit justified reply is posted.
5. Update `## Agent Workpad` with each feedback item and resolution status.
6. Re-run validation after feedback-driven changes.
7. Commit and push updates to the same branch/PR.

## CI repair protocol

Checks must be green on the latest commit.

If CI fails:

1. Inspect failing checks with `pr.inspect-checks` using input such as `{"includeLogs":true,"maxLines":160}`.
2. Scope non-GitHub Actions checks by reporting their details URL. Do not attempt provider-specific automation for external systems unless the repo prompt explicitly defines it.
3. Summarize failures with check name, run URL, and concise log snippet.
4. Create a repair checklist.
5. Implement fixes, rerun relevant local validation, commit, and push.
6. Re-run `pr.inspect-checks` and repeat until checks pass or a true blocker is identified.

## No feedback yet

If there are zero reviews/comments, keep issue in `Agent Review` and stop without state change. Do not treat "no comments yet" as "all comments resolved".

## State transitions

- If all actionable feedback is resolved and checks are green, move the issue to `Human Review` with `issue.update-state` using `{"issueId":"@current","state":"Human Review"}`.
- If PR is missing for current branch, upsert blocker in workpad and move back to execution with `issue.update-state` using `{"issueId":"@current","state":"In Progress"}`.

## Guardrails

- Do not start unrelated implementation work.
- Push to the existing branch. Do not create a new PR.
- Reply to comments in the appropriate GitHub location when action or pushback is required.
- If the helper returns auth or rate-limit errors mid-run, record the exact error in the Agent Workpad and retry only when appropriate.
