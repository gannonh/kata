## Your job: Merge the PR

The issue is in `Merging`. The PR has human approval. Land it cleanly.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations:
- `.agents/skills/sym-state/scripts/sym-call issue.get --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.list-children --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call document.read --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call comment.upsert --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.update-state --input /tmp/input.json`
- `.agents/skills/sym-state/scripts/sym-call issue.create-followup --input /tmp/input.json`

## Merge flow

1. Read `.agents/skills/sym-land/SKILL.md`.
2. Execute the `sym-land` flow until merge succeeds.
3. Confirm target branch contains merged changes.
4. Upsert `## Agent Workpad` with merge proof + cleanup notes.

## State transition

After successful merge:
- `issue.update-state` using `{"issueId":"<current-issue-id>","state":"Done"}`.

{% if issue.children_count > 0 %}
Also verify child task issues are done before finalizing slice completion.
{% endif %}

## Guardrails

- Use `sym-land` for merge orchestration.
- Do not mark done until merge proof is complete.
