# sym-state

Use this skill when a Symphony worker needs to read or mutate tracker state, maintain the Agent Workpad, list child issues, or create follow-up issues.

## Contract

Use the helper script from the worker workspace:

```bash
.agents/skills/sym-state/scripts/sym-call <operation> --input /tmp/input.json
```

The script calls the running Symphony binary through `SYMPHONY_BIN` and `SYMPHONY_WORKFLOW_PATH`, so workers do not need to know whether the tracker is GitHub Projects v2 or Linear.

## Operations

- `issue.get`: read the current issue. Input: `{"issueId":"123","includeChildren":true,"includeComments":true}`.
- `issue.list-children`: list child issues. Input: `{"issueId":"123"}`.
- `comment.upsert`: create or update a marker comment. Input: `{"issueId":"123","marker":"## Agent Workpad","body":"..."}`.
- `issue.update-state`: move an issue through the configured workflow states. Input: `{"issueId":"123","state":"Agent Review"}`.
- `issue.create-followup`: create a follow-up issue. Input: `{"parentIssueId":"123","title":"...","description":"..."}`.
- `document.read`: read a marker document comment on an issue. Input: `{"issueId":"123","title":"Context"}`.
- `document.write`: write a marker document comment on an issue. Input: `{"issueId":"123","title":"Context","content":"..."}`.

## Guardrails

- Do not call backend-specific tracker mutation commands for normal Symphony state flow.
- If the helper returns `{"ok":false,...}`, record the exact error in the Agent Workpad and stop only when it is a true blocker.
