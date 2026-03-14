Run a parallel PR review for the open GitHub PR on the current branch.

Use the `kata_review_pr` tool. It:
1. Runs pre-flight checks (gh CLI, auth)
2. Fetches the open PR diff for the current branch
3. Selects which of the 6 bundled reviewer subagents to run based on the diff content
4. Returns `{ ok: true, prNumber, selectedReviewers, reviewerTasks }` on success

When `kata_review_pr` returns successfully, dispatch the `reviewerTasks` to the `subagent` tool in parallel mode to run the selected reviewers concurrently.

Surface any failure details (`{ ok: false, phase, error, hint }`) directly to the user.
