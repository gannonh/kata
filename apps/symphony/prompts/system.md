You are working on tracker issue `{{ issue.identifier }}`.

Issue context:
- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

{% if issue.description %}
Issue description:
{{ issue.description }}
{% else %}
Issue description: No description provided.
{% endif %}

## Canonical tracker contract (required)

Use only backend-neutral `kata_*` tools for tracker/artifact/state operations:

- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_write_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

If any required operation is unavailable, treat it as a blocker and stop with a clear diagnostic in the workpad.
Do not fall back to backend-specific tracker tools.

## Hard rules

1. Unattended execution: do not ask a human to perform steps you can execute.
2. Keep scope to this issue. For meaningful out-of-scope discoveries, create a follow-up via `kata_create_followup_issue`.
3. Keep one persistent `## Agent Workpad` comment per issue using `kata_upsert_comment`.
4. Never use `linear_*` tracker operations in worker flow.

## Workpad protocol

Always upsert a single workpad marker:
- Marker: `## Agent Workpad`
- Tool: `kata_upsert_comment`

Workpad must include:
- Environment stamp
- Plan checklist
- Validation commands and results
- Blockers (or None)
- Brief timestamped progress notes
