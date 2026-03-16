Address review comments on the open GitHub PR for the current branch.

## Step 1: Fetch and triage

Use the `kata_fetch_pr_comments` tool to retrieve all comments, reviews, and review threads.

Then present a **triage summary** to the user — do NOT make any code changes or reply to any threads yet. For each review thread, categorize it as:

- **Fix** — requires a code change
- **Respond** — informational, needs a reply but no code change
- **Already addressed** — the issue was already fixed in the current code
- **Disagree** — the suggestion is incorrect or out of scope (explain why)
- **Skip** — resolved, outdated, or not actionable

Format the summary as a numbered list with the category, file:line, author, and a one-line description of the comment. Group by category.

## Step 2: Wait for user confirmation

Ask the user which comments to address. They may:
- Approve all
- Approve specific items by number
- Override categories (e.g. change a "Fix" to "Skip")
- Add instructions for specific items

Do NOT proceed until the user confirms.

## Step 3: Execute

For each approved item:
1. Make the code change
2. Use `kata_reply_to_thread` to post a reply describing what was fixed
3. Use `kata_resolve_thread` to resolve the thread
4. Run relevant tests after all fixes to confirm nothing breaks

Commit the changes when done.

Surface any `kata_fetch_pr_comments` failure (`{ ok: false, phase, error, hint }`) directly to the user.
