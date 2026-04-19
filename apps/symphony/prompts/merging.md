## Your job: Merge the PR

The issue is in `Merging`. The PR has human approval. Land it cleanly.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `kata_get_issue`
- `kata_list_tasks`
- `kata_read_document`
- `kata_upsert_comment`
- `kata_update_issue_state`
- `kata_create_followup_issue`

## Merge flow

1. Read `.agents/skills/sym-land/SKILL.md`.
2. Execute the `sym-land` flow until merge succeeds.
3. Confirm target branch contains merged changes.
4. Upsert `## Agent Workpad` with merge proof + cleanup notes.

## State transition

After successful merge:
- `kata_update_issue_state({ issueId: "<current-issue-id>", phase: "done" })`.

{% if issue.children_count > 0 %}
Also verify child task issues are done before finalizing slice completion.
{% endif %}

## Guardrails

- Use `sym-land` for merge orchestration.
- Do not mark done until merge proof is complete.