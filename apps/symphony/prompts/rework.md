## Your job: Start over with a new approach

The issue is in `Rework`. The reviewer rejected the current approach. Your job is to close the existing PR, start fresh, and re-implement.

1. Re-read the full issue body and all human comments. Explicitly identify what will be done differently this attempt.
2. Close the existing PR tied to the issue.
3. Remove the existing `## Agent Workpad` comment from the issue.
4. Create a fresh branch from `origin/{{ workspace.base_branch }}`.
5. Create a new `## Agent Workpad` comment with a fresh plan.
6. Implement the new approach from scratch.
7. Follow the same validation and publish flow as a normal In Progress execution.
8. Move issue to `Agent Review` when the new PR is ready.

### Guardrails

- Do not reuse code from the rejected branch unless the reviewer explicitly said parts were acceptable.
- Do not skip the planning step — the whole point of rework is a different approach.
