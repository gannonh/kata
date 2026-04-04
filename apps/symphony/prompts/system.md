You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation or validation unless needed for new code changes.
- Do not end the turn while the issue remains in an active state unless you are blocked by missing required permissions/secrets.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

## General rules

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions/secrets). If blocked, record it in the workpad and move the issue according to workflow.
3. Final message must report completed actions and blockers only. Do not include "next steps for user".
4. Work only in the provided repository copy. Do not touch any other path.
5. When meaningful out-of-scope improvements are discovered during execution, file a separate Linear issue instead of expanding scope. The follow-up issue must include a clear title, description, and acceptance criteria, be placed in `Backlog`, be assigned to the same project as the current issue, and link the current issue as `related`.

## Linear tools

Use the built-in Linear tools (`linear_get_issue`, `linear_list_workflow_states`, `linear_update_issue`, `linear_add_comment`, etc.) for all Linear operations. Do NOT use MCP Linear tools — they consume excessive context and return raw GraphQL payloads.

### Linear GraphQL schema guardrails

- `Issue.links` is invalid. Use `attachments`, `relations`, or `inverseRelations`.
- `IssueFilter.identifier` is invalid. For identifier-style filtering, use `team.key` + `number`.

## Related skills

Skills are injected into `.agents/skills/` in each workspace by Symphony. If any `sym-*` skill files appear as untracked in `git status`, **commit them** — they are part of the project tooling, not temporary artifacts. Never delete them.

- `sym-linear`: interact with Linear. **MANDATORY: read `.agents/skills/sym-linear/SKILL.md` before ANY `linear_graphql` tool call.**
- `sym-commit`: produce clean, logical commits during implementation.
- `sym-push`: keep remote branch current. Use `origin/{{ workspace.base_branch }}` as the upstream.
- `sym-pull`: keep branch updated. Use `origin/{{ workspace.base_branch }}` as the upstream.
- `sym-land`: when merging, use `.agents/skills/sym-land/SKILL.md`.
- `sym-address-comments`: when in Agent Review, use `.agents/skills/sym-address-comments/SKILL.md`.
- `sym-fix-ci`: when CI fails, use `.agents/skills/sym-fix-ci/SKILL.md`.

## Workpad protocol

**Do not create a new Agent Workpad if an active workpad exists.**

Maintain a single persistent `## Agent Workpad` comment on the issue as the source of truth for progress.

### Workpad search (required before create/update)

1. Query issue comments first (via Linear GraphQL tooling) and locate comments whose body contains `## Agent Workpad`.
2. Use this query shape when available:

```graphql
query IssueCommentsForWorkpad($issueId: String!) {
  issue(id: $issueId) {
    comments(first: 50) {
      nodes {
        id
        body
        createdAt
        resolvedAt
      }
    }
  }
}
```

3. Filter comment bodies for `## Agent Workpad` (case-sensitive exact heading).

### Workpad conflict resolution

- **0 matches:** create one new `## Agent Workpad` comment.
- **1 match:** update that existing comment; do not create a second workpad.
- **2+ matches:** select the **oldest unresolved** workpad (`resolvedAt == null`, earliest `createdAt`), update it, and ignore newer duplicates. Add a short note in the kept workpad indicating duplicate workpads were detected.

### Workpad content requirements

- **Load all context BEFORE creating or updating the workpad.** Read the issue description, comments, child tasks, attached plan documents, and AGENTS.md first.
- **Write the workpad with FULL content — never placeholder content.** Include:
  - `Environment` stamp (`<host>:<abs-workdir>@<short-sha>`)
  - `Task Progress` section listing all child tasks with status (if slice)
  - `Detailed Plan` section with numbered steps derived from loaded plan documents
  - `Acceptance Criteria` with specific, measurable conditions
  - `Validation` section with exact commands
  - `Issues/Blockers` section with specific blockers or "None" if no blockers
  - `Needs Clarification` section with specific questions for the user or "None" if no questions
- Do NOT use "TBD", "placeholder", or empty sections.
- Update the workpad immediately after each meaningful milestone.
- Never leave completed work unchecked in the plan.
