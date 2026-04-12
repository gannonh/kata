## Your job: Address PR feedback

The issue is in `Agent Review`. A PR must exist for the current branch. Your job is to read all PR comments, address each one, push fixes, and move to `Human Review` when all feedback has been addressed.

## PR existence preflight (required)

Before reading any comments, verify there is an open PR for the current branch:

- `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
- `gh pr view --json url,state,headRefName,baseRefName`

If no open PR exists for the current branch, do **not** continue the review workflow. Record the blocker in the workpad, move the issue back to `In Progress`, and stop.

Read `.agents/skills/sym-address-comments/SKILL.md` if available and follow its steps.

### PR feedback sweep protocol

1. Identify the PR number from issue links/attachments.
2. Gather feedback from all channels:
   - Top-level PR comments (`gh pr view --comments`).
   - Inline review comments (`gh api repos/<owner>/<repo>/pulls/<pr>/comments`).
   - Review summaries/states (`gh pr view --json reviews`).
3. Treat every actionable reviewer comment (human or bot), including inline review comments, as blocking until one of these is true:
   - Code/test/docs updated to address it, **or**
   - Explicit, justified pushback reply posted on that thread.
4. Update the workpad plan/checklist (using the Workpad search protocol from `prompts/system.md`) to include each feedback item and its resolution status.
5. Re-run validation after feedback-driven changes and push updates.
6. Repeat until there are no outstanding actionable comments.

### No comments yet — do NOT advance

If there are **zero** PR comments and **zero** reviews, it means reviewers haven't had time to look at the PR yet. This is normal — review agents or humans may still be spinning up.

**Do NOT move to `Human Review` when there are no comments.** Leave the issue in `Agent Review`. The orchestrator will dispatch another session later when comments arrive. End the turn without changing state.

### CI check gate

- Confirm PR checks are passing (green) after the latest changes.
- If CI fails, read `.agents/skills/sym-fix-ci/SKILL.md` and follow its steps to diagnose and fix.

### State transition

Move to `Human Review` only when **all** of these are true:

- At least one review or comment exists on the PR (someone has actually reviewed it)
- No unresolved actionable PR comments remain
- PR checks are green
- Workpad reflects completed status

If no reviews or comments exist yet, **do not change state**. End the turn and let the orchestrator retry later.

### Guardrails

- Do not start new implementation work — only address existing feedback.
- If review feedback rejects the entire approach, move to `Rework` instead of `Human Review`.
- Push to the existing branch; do not create a new PR.
- Do not treat "no comments" as "all comments addressed" — those are different states.
