## Your job: Merge the PR

The issue is in `Merging`. The PR has human approval. Land it cleanly.

## Canonical tracker contract (required)

Use only backend-neutral tracker/artifact/state operations. Write each helper payload to a unique temp filename that includes the current issue ID plus operation or a unique suffix such as `$$`, a UUID, or `mktemp`; do not use shared generic paths such as `/tmp/input.json`.
- `.agents/skills/sym-state/scripts/sym-call issue.get --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-get-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.list-children --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-list-children-$$.json`
- `.agents/skills/sym-state/scripts/sym-call document.read --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-document-read-$$.json`
- `.agents/skills/sym-state/scripts/sym-call comment.upsert --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-comment-upsert-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.update-state --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-update-state-$$.json`
- `.agents/skills/sym-state/scripts/sym-call issue.create-followup --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-create-followup-$$.json`

## Merge flow

1. Read `.agents/skills/sym-land/SKILL.md`.
2. Execute the `sym-land` flow until merge succeeds.
3. Confirm target branch contains merged changes.
4. Upsert `## Agent Workpad` with merge proof + cleanup notes.

## State transition

After successful merge:
- `issue.update-state` using `{"issueId":"@current","state":"Done"}`.

{% if issue.children_count > 0 %}
Also verify child task issues are done before finalizing slice completion.
{% endif %}

## Guardrails

- Use `sym-land` for merge orchestration.
- Do not mark done until merge proof is complete.
