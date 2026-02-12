---
name: kata-review-pull-requests
description: Run a comprehensive pull request review using multiple specialized agents. Each agent focuses on a different aspect of code quality, such as comments, tests, error handling, type design, and general code review. The skill aggregates results and provides a clear action plan for improvements. Triggers include "review PR", "analyze pull request", "code review", and "PR quality check".
metadata:
  version: "1.7.0"
---

# Comprehensive PR Review

Run a comprehensive pull request review by spawning `general-purpose` subagents with inlined reference instructions. Each subagent gets a fresh context window with its specialized review instructions, the diff, and project context.

**Review Aspects (optional):** "$ARGUMENTS"

<process>

## 1. Determine Review Scope

- Check git status to identify changed files
- Parse arguments to see if user requested specific review aspects
- Default: Run all applicable reviews

## 2. Available Review Aspects

| Aspect       | Reference File                       | Purpose                                    |
| ------------ | ------------------------------------ | ------------------------------------------ |
| **code**     | code-reviewer-instructions.md        | General code review for project guidelines |
| **tests**    | pr-test-analyzer-instructions.md     | Test coverage quality and completeness     |
| **comments** | comment-analyzer-instructions.md     | Code comment accuracy and maintainability  |
| **errors**   | failure-finder-instructions.md       | Silent failures and error handling         |
| **types**    | type-design-analyzer-instructions.md | Type design and invariants                 |
| **simplify** | code-simplifier-instructions.md      | Code clarity and maintainability           |
| **all**      | _(all applicable)_                   | Run all reviews (default)                  |

## 3. Identify Changed Files

- Run `git diff --name-only` to see modified files
- Check if PR already exists: `gh pr view`
- Identify file types and what reviews apply

**Error handling:**

- If `git diff` fails (not a git repo): Report error clearly and stop
- If `gh pr view` fails with "no PR found": Expected for pre-PR reviews, continue with git diff
- If `gh pr view` fails with auth error: Note that GitHub CLI authentication is needed
- If no changed files found: Report "No changes detected" and stop

## 4. Determine Applicable Reviews

Based on changes:

- **Always applicable**: code (general quality)
- **If test files changed**: tests
- **If comments/docs added**: comments
- **If error handling changed**: errors
- **If types added/modified**: types
- **After passing review**: simplify (polish and refine)

## 5. Read Reference Instructions

Read each applicable reference file into a variable for inlining into subagent prompts:

```
code_instructions      = Read("./references/code-reviewer-instructions.md")
test_instructions      = Read("./references/pr-test-analyzer-instructions.md")
comment_instructions   = Read("./references/comment-analyzer-instructions.md")
errors_instructions    = Read("./references/failure-finder-instructions.md")
types_instructions     = Read("./references/type-design-analyzer-instructions.md")
simplify_instructions  = Read("./references/code-simplifier-instructions.md")
```

Only read files for applicable review aspects. Also read:

- `git diff` output into `diff_content`
- `CLAUDE.md` (if exists) into `project_context`

## 6. Resolve Model Profile

```bash
MODEL_PROFILE=$(bash "../kata-configure-settings/scripts/read-config.sh" "model_profile" "balanced")
```

Default to "balanced" if not set.

**Model lookup table:**

| Agent            | quality | balanced | budget |
| ---------------- | ------- | -------- | ------ |
| code-reviewer    | opus    | sonnet   | sonnet |
| test-analyzer    | sonnet  | sonnet   | haiku  |
| comment-analyzer | sonnet  | sonnet   | haiku  |
| failure-hunter   | sonnet  | sonnet   | haiku  |
| type-analyzer    | sonnet  | sonnet   | haiku  |
| code-simplifier  | sonnet  | sonnet   | haiku  |

## 7. Launch Review Agents

Spawn `general-purpose` subagents via parallel Task calls. Each agent receives its reference instructions inlined as `<agent-instructions>`, the diff, and project context.

**Task call pattern:**

```
Task(
  prompt="<agent-instructions>\n{instructions_content}\n</agent-instructions>\n\nReview the following changes:\n\n<diff>\n{diff_content}\n</diff>\n\n<project-context>\n{project_context}\n</project-context>",
  subagent_type="general-purpose",
  model="{resolved_model}",
  description="PR review: {aspect}"
)
```

**Example parallel launch (3 agents):**

```
Task(prompt="<agent-instructions>\n{code_instructions}\n</agent-instructions>\n\nReview these changes:\n<diff>\n{diff_content}\n</diff>\n<project-context>\n{project_context}\n</project-context>", subagent_type="general-purpose", model="{code_model}", description="PR review: code")
Task(prompt="<agent-instructions>\n{test_instructions}\n</agent-instructions>\n\nReview these changes:\n<diff>\n{diff_content}\n</diff>\n<project-context>\n{project_context}\n</project-context>", subagent_type="general-purpose", model="{test_model}", description="PR review: tests")
Task(prompt="<agent-instructions>\n{errors_instructions}\n</agent-instructions>\n\nReview these changes:\n<diff>\n{diff_content}\n</diff>\n<project-context>\n{project_context}\n</project-context>", subagent_type="general-purpose", model="{errors_model}", description="PR review: errors")
```

All run in parallel. Task tool blocks until all complete.

**Agent failure handling:**

- If agent completes: Include results in aggregation
- If agent times out: Report "[aspect] review timed out - consider running independently"
- If agent fails: Report "[aspect] review failed: [error reason]"
- If one agent fails, STILL proceed with remaining agents
- **Never silently skip a failed agent** - always report its status

## 8. Aggregate Results

After agents complete, summarize:

- **Critical Issues** (must fix before merge)
- **Important Issues** (should fix)
- **Suggestions** (nice to have)
- **Positive Observations** (what's good)

**Edge cases:**

- If no issues found: "All Checks Passed" summary
- If agents conflict: Note the disagreement and let user decide
- If agent output malformed: Note "[aspect] output could not be parsed"
- Always include count of agents completed vs failed

## 9. Provide Action Plan

Organize findings:

```markdown
# PR Review Summary

## Critical Issues (X found)

- [aspect]: Issue description [file:line]

## Important Issues (X found)

- [aspect]: Issue description [file:line]

## Suggestions (X found)

- [aspect]: Suggestion [file:line]

## Strengths

- What's well-done in this PR

## Recommended Action

1. Fix critical and important issues
2. Consider suggestions
3. Re-run review after fixes
```

## 10. Handle Review Findings

Route based on review results:

| Findings                      | Route                     |
| ----------------------------- | ------------------------- |
| Critical issues found         | Route A (must address)    |
| Important issues, no critical | Route B (should address)  |
| Suggestions only              | Route C (optional)        |
| No issues                     | Route D (clean) → step 11 |

---

**Route A: Critical issues found**

Use AskUserQuestion:

- header: "Critical Issues"
- question: "{N} critical issues found. How do you want to handle them?"
- options:
  - "Fix all issues" — fix critical, important, and suggestions
  - "Fix critical only" — fix critical, add rest to backlog
  - "Add all to backlog" — create issues for everything, fix nothing now
  - "Skip" — continue without addressing

**Route B: Important issues, no critical**

Use AskUserQuestion:

- header: "Review Findings"
- question: "{N} important issues found. How do you want to handle them?"
- options:
  - "Fix all issues" — fix important and suggestions
  - "Fix important only" — fix important, add suggestions to backlog
  - "Add to backlog" — create issues, fix nothing now
  - "Skip" — continue without addressing

**Route C: Suggestions only**

Use AskUserQuestion:

- header: "Suggestions"
- question: "{N} suggestions found. Address them?"
- options:
  - "Fix suggestions" — apply suggested improvements
  - "Add to backlog" — create issues for later
  - "Skip" — continue without addressing

---

**Handling "Fix" paths:**

1. Apply fixes to the identified files
2. Stage and commit: `fix: address PR review findings`
3. If PR exists, push to branch

**Handling "Add to backlog":**

1. Create GitHub issues for each finding via `gh issue create`
2. Store TODOS_CREATED count for output

**After handling (or Route D):** Proceed to step 11.

## 11. Offer Next Actions

Resolve phase context for next-up routing:

```bash
# Current phase from STATE.md
CURRENT_PHASE=$(grep -oP 'Current Phase:\s*\K\d+' .planning/STATE.md 2>/dev/null || echo "")
NEXT_PHASE=$((CURRENT_PHASE + 1))

# Check if more phases remain
TOTAL_PHASES=$(grep -c '^## Phase' .planning/ROADMAP.md 2>/dev/null || echo "0")
```

{If PR exists from step 3:}

Use AskUserQuestion:

- header: "Next Step"
- question: "Review complete. What next?"
- options:
  - "Merge PR" — merge and clean up branch
  - "Verify work" — conversational acceptance testing
  - "Done" — stop here

{If no PR exists:}

Use AskUserQuestion:

- header: "Next Step"
- question: "Review complete. What next?"
- options:
  - "Verify work" — conversational acceptance testing
  - "Done" — stop here

---

**If user chose "Merge PR":**

```bash
gh pr merge "$PR_NUMBER" --merge --delete-branch
git checkout main && git pull
```

{If TODOS_CREATED: Backlog: {N} issues created from review findings}

Show: `PR: #{pr_number} — merged ✓`

Then show post-merge next up:

───────────────────────────────────────────────────────────────

## ▶ Next Up

{If NEXT_PHASE <= TOTAL_PHASES:}

**Phase {Z+1}: {Name}** — {Goal from ROADMAP.md}

`/kata-discuss-phase {Z+1}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- `/kata-plan-phase {Z+1}` — skip discussion, plan directly
- `/kata-execute-phase {Z+1}` — skip to execution (if already planned)

{If last phase (NEXT_PHASE > TOTAL_PHASES):}

**Audit milestone** — verify requirements, cross-phase integration

`/kata-audit-milestone`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**

- `/kata-complete-milestone` — skip audit, archive directly

{If no phase context:}

**Walk through deliverables** — conversational acceptance testing

`/kata-verify-work`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If user chose "Verify work":**

{If TODOS_CREATED: Backlog: {N} issues created from review findings}

───────────────────────────────────────────────────────────────

## ▶ Next Up

**Walk through deliverables** — conversational acceptance testing

`/kata-verify-work {Z}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

---

**If user chose "Done":** Stop.

{If TODOS_CREATED: Backlog: {N} issues created from review findings}

</process>
