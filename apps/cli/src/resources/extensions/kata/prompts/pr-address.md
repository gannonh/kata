Address review comments on the open GitHub PR for the current branch.

Use the `kata_fetch_pr_comments` tool to retrieve all comments, reviews, and review threads for the open PR. It returns structured JSON with `conversation_comments`, `reviews`, and `review_threads`.

Then work through the feedback:
1. Triage: identify which comments require code changes versus those that are informational, already addressed, or out of scope
2. Fix: make the required code changes, one comment thread at a time
3. Verify: run relevant tests to confirm fixes do not break existing behavior
4. Respond: use the `subagent` tool if you need to post replies to specific threads

Surface any `kata_fetch_pr_comments` failure (`{ ok: false, phase, error, hint }`) directly to the user.
