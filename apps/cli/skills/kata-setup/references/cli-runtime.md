# CLI Runtime

Kata backend IO is performed through the local skill helper. Do not call abstract operation names by themselves.

## CLI Resolution

The helper chooses the CLI runtime in this order:

1. `KATA_CLI_ROOT`: local development checkout, resolved from the project workspace and run through `<root>/dist/loader.js`.
2. `KATA_CLI_BIN`: explicit executable or wrapper supplied by a harness, desktop app, or plugin.
3. `npx --yes @kata-sh/cli`: published npm package fallback.

Installed skills should call `node <path-to-skill-directory>/scripts/kata-call.mjs ...` only. Do not hardcode monorepo paths, package-manager commands, or backend adapter details in workflow steps.

## Command Pattern

Run commands from the user's project workspace.

CLI commands:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs doctor
node <path-to-skill-directory>/scripts/kata-call.mjs setup
```

No-input operations:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
```

Required-input operations:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
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
node <path-to-skill-directory>/scripts/kata-call.mjs project.upsert --input /tmp/kata-project-upsert.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
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
