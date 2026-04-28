# CLI Runtime

Kata backend IO is performed through the local skill helper. Do not call abstract operation names by themselves.

## Command Pattern

Run commands from the user's project workspace.

No-input operations:

```bash
node ./scripts/kata-call.mjs project.getContext
node ./scripts/kata-call.mjs health.check
node ./scripts/kata-call.mjs milestone.getActive
```

Required-input operations:

```bash
node ./scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
```

Create the JSON payload file before running any operation that requires `--input`.

## Temporary Payload Files

Use `/tmp/kata-<operation>.json` unless the harness provides a better scratch path.

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

