Address review comments on the open GitHub PR for the current branch.

Automated reviewers (CodeRabbit, Greptile, Kata's own PR reviewers) don't have access to the full codebase and may not understand the project's architecture, conventions, or constraints. Every comment must be validated against the actual code before accepting it.

## Step 1: Fetch comments

Use the `kata_fetch_pr_comments` tool to retrieve all comments, reviews, and review threads.

## Step 2: Evaluate each comment against the codebase

For each review thread, **read the relevant file(s)** to understand the full context before making a judgment. Do NOT accept or reject comments based on the comment text alone.

Apply this decision framework to each comment:

1. **Is it correct?** — Does the issue actually exist in the current code?
2. **Is it relevant?** — Does it apply to this project's architecture and conventions?
3. **Is it beneficial?** — Will fixing it meaningfully improve the code?
4. **Is it safe?** — Could the suggested change introduce new problems?

Only accept if all answers are "yes" or the benefit clearly outweighs risks.

### Patterns to accept

- Actual bugs (null checks, error handling, logic errors)
- Security vulnerabilities (unless false positive)
- Resource leaks (unclosed connections, handles)
- Type safety issues
- Missing error handling on critical paths

### Patterns to typically ignore

- Style preferences that conflict with project conventions
- Generic best practices that don't apply to the specific use case
- Performance optimizations for non-performance-critical code
- Import reorganization that would break project structure
- Suggestions that are already handled elsewhere in the codebase

## Step 3: Present triage summary

Present the evaluated results to the user — do NOT make any code changes or reply to any threads yet.

For each review thread, show:

- **Category**: Fix, Respond, Already addressed, Disagree, or Skip
- **File:line**, author, one-line description
- **Your reasoning**: Brief explanation of why you categorized it this way, referencing what you found in the code

Group by category. Show the total counts.

## Step 4: Wait for user confirmation

Ask the user which comments to address. They may:

- Approve all
- Approve specific items by number
- Override categories (e.g. change a "Fix" to "Skip")
- Add instructions for specific items

Do NOT proceed until the user confirms.

## Step 5: Execute approved fixes

For each approved item:

1. Make the code change
2. Use `kata_reply_to_thread` to post a reply describing what was fixed
3. Use `kata_resolve_thread` to resolve the thread
4. For comments not addressed, reply to reviewers with your reasoning and ask for any clarification if needed.

After all fixes, run relevant tests to confirm nothing breaks. Commit the changes.

## Step 6: Summary report

After completion, provide:

---

📋 PR Comment Review Summary

Threads evaluated: {total}
  Fixed: {count} — code changes applied
  Responded: {count} — replied without code change
  Already addressed: {count} — no action needed
  Disagreed: {count} — rejected with explanation
  Skipped: {count} — resolved/outdated/not actionable

Files modified: {list}
Tests: {pass/fail status}

---

Surface any `kata_fetch_pr_comments` failure (`{ ok: false, phase, error, hint }`) directly to the user.
