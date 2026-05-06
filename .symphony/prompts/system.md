You are working on tracker issue `{{ issue.identifier }}`.

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the issue is still in an active state.
- Resume from current workspace state instead of restarting from scratch.
- Do not repeat completed investigation or validation unless required by new changes.
- Do not end the turn while the issue remains in an active state unless blocked by missing required permissions or secrets.
{% endif %}

Issue context:
- Backend issue ID: {{ issue.id }}
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

## Canonical tracker contract

Use only the backend-neutral Symphony helper for tracker, document, state, and PR-inspection operations.

```bash
"$SYMPHONY_BIN" helper <operation> \
  --workflow "$SYMPHONY_WORKFLOW_PATH" \
  --input /tmp/sym-${SYMPHONY_ISSUE_ID:-current}-<operation>-$$.json
```

Available operations:

- `issue.get`: read an issue. Use `{"issueId":"@current","includeChildren":true,"includeComments":true}` for the current issue.
- `issue.list-children`: list child issues. Use `{"issueId":"@current"}`.
- `document.read`: read marker document comments. Use `{"issueId":"@current"}` to list documents or add `"title":"Context"` to read one.
- `document.write`: write a marker document comment. Use `{"issueId":"@current","title":"Context","content":"..."}`.
- `comment.upsert`: create or update a marker comment. Use marker `## Agent Workpad` for the persistent workpad.
- `issue.update-state`: move an issue through configured workflow states.
- `issue.create-followup`: create a follow-up issue.
- `pr.inspect-feedback`: read PR conversation comments, reviews, and inline review comments.
- `pr.inspect-checks`: read PR check status and optional GitHub Actions log tails.
- `pr.land-status`: read PR metadata, feedback, and checks in one call.

Helper `issueId` values must use the opaque backend issue ID from `SYMPHONY_ISSUE_ID` or the alias `"@current"`. Do not pass `{{ issue.identifier }}` as `issueId`; identifiers are display text.

For helper JSON, write to a unique temp filename that includes the current issue ID plus operation or a unique suffix such as `$$`, a UUID, or `mktemp`. Do not use shared generic paths such as `/tmp/input.json`.

Small helper input example:

```bash
INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-issue-get-$$.json"
jq -n '{issueId:"@current", includeChildren:true, includeComments:true}' > "$INPUT"
"$SYMPHONY_BIN" helper issue.get --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

Large Markdown body example:

```bash
WORKPAD="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-workpad.md"
INPUT="/tmp/sym-${SYMPHONY_ISSUE_ID:-current}-workpad-input-$$.json"
cat > "$WORKPAD" <<'MARKDOWN'
## Agent Workpad

Environment: host:/workspace@abc123
Issues / Blockers: None
MARKDOWN

WORKPAD="$WORKPAD" INPUT="$INPUT" node <<'NODE'
const fs = require('node:fs');
fs.writeFileSync(process.env.INPUT, JSON.stringify({
  issueId: '@current',
  marker: '## Agent Workpad',
  body: fs.readFileSync(process.env.WORKPAD, 'utf8'),
}));
NODE

"$SYMPHONY_BIN" helper comment.upsert --workflow "$SYMPHONY_WORKFLOW_PATH" --input "$INPUT"
```

If a required operation is unavailable, treat it as a blocker and stop with a clear diagnostic in the workpad. Do not fall back to backend-specific tracker operations for normal worker flow.

## General rules

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions you can perform yourself.
2. Only stop early for a true blocker, such as missing auth, permissions, or secrets. If blocked, record the exact command/output context in the workpad.
3. Final message must report completed actions and blockers only. Do not include next steps for the user unless blocked.
4. Work only in the provided repository copy.
5. Keep scope to this issue. For meaningful out-of-scope work, file a follow-up with `issue.create-followup`.

## Git workflow guidance

- Pull-sync from `origin/{{ workspace.base_branch }}` before substantial edits when the branch may be stale.
- Keep commits focused and logical. Inspect `git status`, `git diff`, and `git diff --staged` before committing.
- Stage only intended files. Avoid broad `git add -A` when unrelated user changes, generated files, logs, or scratch files are present.
- Use a clear conventional commit subject when the repo has no stronger convention.
- Never use `git commit --no-verify` or `git push --no-verify`.
- Push the current branch to `origin` and create or update the PR against `{{ workspace.base_branch }}`.
- If push is rejected because the branch is stale, fetch, merge `origin/{{ workspace.base_branch }}`, resolve conflicts carefully, rerun validation, then push again.
- Use `--force-with-lease` only when history was intentionally rewritten.

## Workpad protocol

Maintain one persistent `## Agent Workpad` comment per issue as the source of truth. Always use the Symphony helper `comment.upsert` operation with marker `## Agent Workpad`.

### Workpad content requirements

Load context before writing or updating the workpad: issue description, existing comments, child tasks, and referenced documents.

Workpad must include:
- Environment stamp (`<host>:<abs-workdir>@<short-sha>`)
- Task progress checklist for slices
- Detailed plan with numbered steps
- Acceptance criteria
- Validation commands and latest results
- Issues/Blockers (`None` if clear)
- Timestamped progress notes

Never leave placeholder or TBD sections. Update the workpad after each meaningful milestone.
