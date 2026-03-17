Run a parallel PR review for the open GitHub PR on the current branch.

Use the `kata_review_pr` tool. It:
1. Runs pre-flight checks (gh CLI, auth)
2. Fetches the open PR diff for the current branch
3. Selects which of the 6 bundled reviewer subagents to run based on the diff content
4. Spawns the selected reviewers in parallel as child processes
5. Aggregates findings and returns `{ ok: true, prNumber, selectedReviewers, findings }` on success

Present the `findings` to the user. The findings are already grouped by severity (Critical, Important, Suggestions).

Surface any failure details (`{ ok: false, phase, error, hint }`) directly to the user.
