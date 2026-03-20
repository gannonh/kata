---
name: address-comments
description: Help address review/issue comments on the open GitHub PR for the current branch using gh CLI; verify gh auth first and prompt the user to authenticate if not logged in.
metadata:
  short-description: Address comments in a GitHub PR review
---

# PR Comment Handler

Guide to find the open PR for the current branch and address its comments with gh CLI. Run all `gh` commands with elevated network access.

## Preflight

1. Create a structured task list of the following steps 
2. Inform the user of what you are doing

You should endeavor to run this entire workflow autonomously, only engaging the user if issues arise or uncertain how to best proceed.

### Step 1: Inspect comments needing attention

- Run `<path-to-skill>/scripts/fetch_comments.py` which will print out all the comments and review threads on the PR

### Step 2: Enumarate issues identified in comments and review threads

- Number all the review threads and comments 
- Provide a short summary of each "issue candidate," including any suggested fixes from the reviewer

### Step 3: Identify actionable issues to address

- For each issue candidate, analyze against the codebase to distinguish actionable items from false positives or comments that do not require code changes (for example, questions, suggestions, or style comments).

### Step 4: Apply fixes to all actionable issues & resolve/address comments

- Use TDD when possible: write a failing test that captures the issue, then apply the fix to make the test pass.
- Resolve or reply to those threads in the GitHub UI as you address them. For comments not addressed, reply to reviewers with your reasoning and ask for any clarification if needed.

### Step 5: Run checks, commit and push changes

- After applying fixes, run the relevant tests and checks locally to confirm the issue is resolved.
- Summarize the changes made, commit with a clear message referencing the PR and issue numbers, and push the changes to the PR branch.

### Step 6: Monitor CI Actions and address any new failures

- After pushing, monitor the PR's CI checks for any new failures that may arise from the changes.
- If new failures occur, use the `fix-ci` skill to analyze the CI logs, identify the root cause, and apply necessary fixes.

## Final verification and summary

- Double check that all comments have been addressed and resolved in the GitHub UI.
- Summarize the outcome of the comment addressing process, including any remaining open questions or follow-ups needed with reviewers.

Notes:

- If gh hits auth/rate issues mid-run, prompt the user to re-authenticate with `gh auth login`, then retry.
- If sandboxing blocks `gh auth status`, rerun it with `sandbox_permissions=require_escalated`.
