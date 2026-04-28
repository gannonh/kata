# Runtime Contract

Use only these typed runtime operations:

## `project.upsert`

Create a JSON payload file first, then run:

```bash
node ./scripts/kata-call.mjs project.upsert --input /tmp/kata-project-upsert.json
```

Payload example:

```json
{
  "title": "Todo App",
  "description": "A focused app for tracking personal tasks."
}
```

## `artifact.write`

Create a JSON payload file first, then run:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
```

Payload example:

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

## `health.check`

Run:

```bash
node ./scripts/kata-call.mjs health.check
```


Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
