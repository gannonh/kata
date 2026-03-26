## Your job: Merge the PR

The issue is in `Merging`. The PR has been approved by a human. Your job is to land it.

1. Read `.codex/skills/land/SKILL.md` and follow its steps. Do not call `gh pr merge` directly.
2. Run the land skill in a loop until the PR is merged.
3. After merge is complete, move the issue to `Done`.
{% if issue.children_count > 0 %}
4. Verify all child task issues are already `Done`. If any are not, move them to `Done` before marking the slice done.
{% endif %}

### Guardrails

- Use the `land` skill exclusively — it handles merge strategy, branch cleanup, and post-merge checks.
- If merge fails due to CI, fix the issue and retry. Do not move to `Done` until the merge succeeds.
