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
- `document.read`: read marker document comments on an issue. Input: `{"issueId":"123"}` lists all marker docs; `{"issueId":"123","title":"Context"}` reads one marker doc.
- `document.write`: write a marker document comment on an issue. Input: `{"issueId":"123","title":"Context","content":"..."}`.
- `pr.inspect-feedback`: read PR conversation comments, reviews, and inline review comments. Input: `{"pr":"123"}`; omit `pr` to use the current branch PR.
- `pr.inspect-checks`: read PR check status. Input: `{"pr":"123","includeLogs":true,"maxLines":160}`; omit `pr` to use the current branch PR.
- `pr.land-status`: read PR metadata, feedback, and check status in one call. Input: `{"pr":"123","includeLogs":false}`; omit `pr` to use the current branch PR.

## JSON Payload Recipes

For small inputs, write JSON directly:

```bash
cat > /tmp/sym-input.json <<'JSON'
{"issueId":"123","state":"Agent Review"}
JSON
.agents/skills/sym-state/scripts/sym-call issue.update-state --input /tmp/sym-input.json
```

For large Markdown bodies or helper output summaries, use Node.js as the JSON
construction/parsing tool. The helper is still `sym-call`, a shell wrapper that
invokes the Symphony Rust binary; Node is only used here to avoid quoting and
escaping mistakes.

```bash
cat > /tmp/workpad.md <<'MARKDOWN'
## Agent Workpad

Environment: host:/workspace@abc123
Issues / Blockers: None
MARKDOWN

node <<'NODE'
const fs = require('node:fs');

fs.writeFileSync('/tmp/workpad-input.json', JSON.stringify({
  issueId: '123',
  marker: '## Agent Workpad',
  body: fs.readFileSync('/tmp/workpad.md', 'utf8'),
}));
NODE

.agents/skills/sym-state/scripts/sym-call comment.upsert --input /tmp/workpad-input.json
```

```bash
node <<'NODE'
const { execFileSync } = require('node:child_process');

const raw = execFileSync(
  '.agents/skills/sym-state/scripts/sym-call',
  ['pr.inspect-feedback', '--input', '/tmp/pr-feedback.json'],
  { encoding: 'utf8' },
);
const result = JSON.parse(raw);
const data = result.data || {};
console.log('reviews', (data.reviews || []).length);
console.log('reviewThreads', (data.reviewThreads || []).length);
console.log('issueComments', (data.issueComments || []).length);
NODE
```

## Guardrails

- Do not call backend-specific tracker mutation commands for normal Symphony state flow.
- If the helper returns `{"ok":false,...}`, record the exact error in the Agent Workpad and stop only when it is a true blocker.
