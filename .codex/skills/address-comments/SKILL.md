# Address PR Comments

Use this skill when the issue is in `Agent Review` state to address PR review feedback.

## Steps

### 1. Fetch all PR comments and review threads

Run the fetch script to get structured JSON of all comments:

```bash
python3 .codex/skills/address-comments/scripts/fetch_comments.py
```

This returns conversation comments, reviews, and inline review threads with resolved/unresolved status.

### 2. Identify unresolved actionable items

For each unresolved review thread:
- Read the comment body and any suggested fixes
- Determine if it requires a code change, a reply, or both
- Skip already-resolved threads

### 3. Address each item

For each actionable item:
- Make the code fix if needed
- Reply to the thread explaining what was done:
  ```bash
  gh api graphql -f query='mutation { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: "<thread_id>", body: "<reply>"}) { comment { id } } }'
  ```
- Resolve the thread after addressing it:
  ```bash
  gh api graphql -f query='mutation { resolveReviewThread(input: {threadId: "<thread_id>"}) { thread { isResolved } } }'
  ```

For non-actionable items (questions, style suggestions you disagree with):
- Reply with clear reasoning
- Do NOT resolve — let the reviewer decide

### 4. Validate and push

- Run `cd apps/symphony && cargo test`
- Run `cd apps/symphony && cargo clippy -- -D warnings`
- Commit with a clear message referencing the feedback
- Push to the existing branch (do not create a new branch)

### 5. Verify all threads addressed

Run the fetch script again and confirm no unresolved actionable threads remain.

### 6. Move to Human Review

After all feedback is addressed, move the issue to `Human Review`.
