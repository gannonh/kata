## Your job: Address PR feedback

The issue is in `Agent Review`. A PR exists. Your job is to read all PR comments, address each one, push fixes, and move to `Human Review` when done.

Read `.codex/skills/address-comments/SKILL.md` if available and follow its steps.

### PR feedback sweep protocol

1. Identify the PR number from issue links/attachments.
2. Gather feedback from all channels:
   - Top-level PR comments (`gh pr view --comments`).
   - Inline review comments (`gh api repos/<owner>/<repo>/pulls/<pr>/comments`).
   - Review summaries/states (`gh pr view --json reviews`).
3. Treat every actionable reviewer comment (human or bot), including inline review comments, as blocking until one of these is true:
   - Code/test/docs updated to address it, **or**
   - Explicit, justified pushback reply posted on that thread.
4. Update the workpad plan/checklist to include each feedback item and its resolution status.
5. Re-run validation after feedback-driven changes and push updates.
6. Repeat until there are no outstanding actionable comments.

### CI check gate

- Confirm PR checks are passing (green) after the latest changes.
- If CI fails, read `.codex/skills/fix-ci/SKILL.md` and follow its steps to diagnose and fix.

### State transition

When **all** of these are true:
- No unresolved actionable PR comments remain
- PR checks are green
- Workpad reflects completed status

Move issue to `Human Review`.

### Guardrails

- Do not start new implementation work — only address existing feedback.
- If review feedback rejects the entire approach, move to `Rework` instead of `Human Review`.
- Push to the existing branch; do not create a new PR.
