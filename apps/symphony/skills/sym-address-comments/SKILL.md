---
name: sym-address-comments
description: Help address review/issue comments on the open GitHub PR for the current branch using Symphony workflow guidance and helper APIs.
metadata:
  short-description: Address comments in a GitHub PR review
---

# PR Comment Handler

Guide to find the open PR for the current branch and address its comments during a Symphony worker run. Use Kata CLI operations only for Kata project/slice/task/artifact backend-state when applicable. Use the Symphony helper for PR feedback discovery so workers do not need backend-specific prompt branches.

### Step 1: Inspect comments needing attention

- Confirm the local branch/worktree maps to the intended GitHub PR. If this work is part of an active Kata slice or task, use the active Kata backend-state workflow for durable task/slice/artifact evidence.
- Write an input file, for example `/tmp/sym-pr-feedback.json`:
  `{"pr":"<number-or-url>"}`
- Run `.agents/skills/sym-state/scripts/sym-call pr.inspect-feedback --input /tmp/sym-pr-feedback.json` to list conversation comments, reviews, and inline review comments.
- Omit `pr` to inspect the current branch PR.

### Step 2: Enumarate issues identified in comments and review threads

- Number all the review threads and comments
- Provide a short summary of each "issue candidate," including any suggested fixes from the reviewer

### Step 3: Identify actionable issues to address

- For each issue candidate, analyze against the codebase to distinguish actionable items from false positives or comments that do not require code changes (for example, questions, suggestions, or style comments).

### Step 4: Apply fixes to all actionable issues & resolve/address comments

- Use TDD when possible: write a failing test that captures the issue, then apply the fix to make the test pass.
- Resolve or reply to those threads with GitHub review APIs as you address them. For comments not addressed, reply to reviewers with your reasoning and ask for any clarification if needed. Keep GitHub comment state in GitHub; keep Kata execution/verification summaries in Kata artifacts when the PR work is attached to a Kata task.

### Step 5: Run checks, commit and push changes

- After applying fixes, run the relevant tests and checks locally to confirm the issue is resolved.
- Summarize the changes made, commit with a clear message referencing the PR and issue numbers, and push the changes to the PR branch. If the active workflow is Kata-backed, preserve its atomic task-scoped commit and artifact/status rules before marking task work complete.

### Step 6: Monitor CI Actions and address any new failures

- After pushing, monitor the PR's CI checks for any new failures that may arise from the changes.
- If new failures occur, use the `sym-fix-ci` skill to analyze the CI logs, identify the root cause, and apply necessary fixes.

## Final verification and summary

- Double check that all comments have been addressed and resolved in the GitHub UI.
- Summarize the outcome of the comment addressing process, including any remaining open questions or follow-ups needed with reviewers.

Notes:

- If the Symphony helper returns auth/rate-limit errors mid-run, record the exact error in the Agent Workpad and retry when appropriate.
