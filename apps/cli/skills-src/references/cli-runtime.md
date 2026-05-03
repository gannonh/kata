# CLI Runtime

Kata backend IO is performed through the local skill helper. Do not call abstract operation names by themselves.

## CLI Resolution

The helper chooses the CLI runtime in this order:

1. `KATA_CLI_ROOT`: local development checkout, resolved from the project workspace and run through `<root>/dist/loader.js`.
2. `KATA_CLI_BIN`: explicit executable or wrapper supplied by a harness, desktop app, or plugin.
3. `npx --yes @kata-sh/cli`: published npm package fallback.

Installed skills should call `node ./scripts/kata-call.mjs ...` only. Do not hardcode monorepo paths, package-manager commands, or backend adapter details in workflow steps.

## Command Pattern

Run commands from the user's project workspace.

CLI commands:

```bash
node ./scripts/kata-call.mjs doctor
node ./scripts/kata-call.mjs setup
```

No-input operations:

```bash
node ./scripts/kata-call.mjs project.getContext
node ./scripts/kata-call.mjs health.check
node ./scripts/kata-call.mjs milestone.getActive
```

Required-input operations:

```bash
node ./scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
node ./scripts/kata-call.mjs issue.create --input /tmp/kata-issue-create.json
node ./scripts/kata-call.mjs issue.get --input /tmp/kata-issue-get.json
node ./scripts/kata-call.mjs issue.updateStatus --input /tmp/kata-issue-status.json
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
```

Create the JSON payload file before running any operation that requires `--input`.

## Temporary Payload Files

Use a scope-specific scratch path when a milestone, slice, task, or artifact ID is known. Prefer `/tmp/kata-<scope>-<operation>.json`, such as `/tmp/kata-S004-slice-done.json` or `/tmp/kata-T012-task-done.json`, so repeated operations cannot accidentally reuse stale payloads. Use `/tmp/kata-<operation>.json` only for one-off setup operations with no stable scope ID.

Example:

```bash
cat > /tmp/kata-milestone-create.json <<'JSON'
{
  "title": "v1.0 Todo App MVP",
  "goal": "Deliver a usable todo app with persistent tasks, completion state, and basic project structure."
}
JSON
node ./scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
```

## Response Handling

Successful responses have this shape:

```json
{
  "ok": true,
  "data": {}
}
```

Failed responses have this shape:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Field \"title\" must be a non-empty string."
  }
}
```

Treat `ok: false` as blocking. Read the error message, fix the payload or setup issue, and rerun the same operation.

## Rules

- Do not inspect `scripts/kata-call.mjs` unless the command itself fails.
- Do not run `npx @kata-sh/cli` from an installed local skill when `scripts/kata-call.mjs` is available.
- Do not store durable project state in local markdown files; durable state goes through the CLI contract.
- Do not invent backend-specific behavior in skill logic.

## Operation Payloads

### `project.getContext`

Command:

```bash
node ./scripts/kata-call.mjs project.getContext
```

Expected data:

```json
{
  "backend": "github",
  "workspacePath": "/path/to/workspace",
  "repository": {
    "owner": "owner",
    "name": "repo"
  }
}
```

### `project.upsert`

Payload:

```json
{
  "title": "Todo App",
  "description": "A small app for tracking personal tasks through a clean web UI."
}
```

Command:

```bash
node ./scripts/kata-call.mjs project.upsert --input /tmp/kata-project-upsert.json
```

Expected data:

```json
{
  "backend": "github",
  "workspacePath": "/path/to/workspace",
  "title": "Todo App",
  "description": "A small app for tracking personal tasks through a clean web UI.",
  "repository": {
    "owner": "owner",
    "name": "repo"
  }
}
```

### `milestone.create`

Payload:

```json
{
  "title": "v1.0 Todo App MVP",
  "goal": "Deliver persistent task creation, completion, editing, and deletion."
}
```

Command:

```bash
node ./scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
```

Expected data:

```json
{
  "id": "M001",
  "title": "v1.0 Todo App MVP",
  "goal": "Deliver persistent task creation, completion, editing, and deletion.",
  "status": "active",
  "active": true
}
```

### `issue.listOpen`

Command:

```bash
node ./scripts/kata-call.mjs issue.listOpen
```

Expected data includes summary records only, without issue bodies:

```json
[
  {
    "id": "I001",
    "number": 462,
    "title": "Fix first-run setup messaging",
    "status": "backlog",
    "url": "https://github.com/owner/repo/issues/462"
  }
]
```

### `issue.create`

Payload:

```json
{
  "title": "Fix first-run setup messaging",
  "design": "## Problem\n\nThe setup output is confusing.\n\n## Proposed approach\n\nRender concrete supported skill locations.",
  "plan": "## Tasks\n\n- [ ] Add a focused test.\n- [ ] Update the renderer.\n- [ ] Run CLI validation."
}
```

Command:

```bash
node ./scripts/kata-call.mjs issue.create --input /tmp/kata-issue-create.json
```

Expected data:

```json
{
  "id": "I001",
  "title": "Fix first-run setup messaging",
  "body": "# Design\n\n...\n\n# Plan\n\n...",
  "status": "backlog",
  "url": "https://github.com/owner/repo/issues/123"
}
```

### `issue.get`

Payload:

```json
{
  "issueRef": "I001"
}
```

`issueRef` may be a Kata issue ID, GitHub issue number such as `462` or `#462`, or an unambiguous title substring.

Command:

```bash
node ./scripts/kata-call.mjs issue.get --input /tmp/kata-issue-get.json
```

Expected data includes the full issue body:

```json
{
  "id": "I001",
  "number": 462,
  "title": "Fix first-run setup messaging",
  "body": "# Design\n\n...\n\n# Plan\n\n...",
  "status": "backlog",
  "url": "https://github.com/owner/repo/issues/462"
}
```

### `issue.updateStatus`

Payload:

```json
{
  "issueId": "I001",
  "status": "in_progress"
}
```

Command:

```bash
node ./scripts/kata-call.mjs issue.updateStatus --input /tmp/kata-issue-status.json
```

Supported statuses: `backlog`, `todo`, `in_progress`, `done`.

### `artifact.write`

Payload:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements",
  "title": "M001 Requirements",
  "content": "# Requirements\n\n- [ ] **TODO-01**: User can create a task.",
  "format": "markdown"
}
```

Command:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
```

Expected data includes the persisted artifact:

```json
{
  "id": "artifact-id",
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements",
  "title": "M001 Requirements",
  "content": "# Requirements\n\n- [ ] **TODO-01**: User can create a task.",
  "format": "markdown",
  "updatedAt": "2026-04-28T00:00:00.000Z",
  "provenance": {
    "backend": "github",
    "backendId": "..."
  }
}
```
