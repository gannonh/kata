## Your job: Merge the PR

The issue is in `Merging`. The PR has been approved by a human. Your job is to land it.

1. Read `.agents/skills/sym-land/SKILL.md` and follow its steps directly in this session. Do not call `gh pr merge` directly.
2. Run the land skill in a loop until the PR is merged.
3. After merge is complete, move the issue to `Done`.
{% if issue.children_count > 0 %}
4. Verify all child task issues are already `Done`. If any are not, move them to `Done` before marking the slice done.
{% endif %}

### Guardrails

- Use the `sym-land` skill exclusively — it handles merge strategy, branch cleanup, and post-merge checks.
- Do NOT use `kata_merge_pr` or `kata_create_pr` — those tools expect Kata branch naming (`kata/M001/S01`) which Symphony does not use.
- Do NOT delegate landing to a `subagent` — execute the skill steps directly in this session.
- If merge fails due to CI, fix the issue and retry. Do not move to `Done` until the merge succeeds.
