# Runtime Contract

Use only these typed runtime operations:

## `project.getContext`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

## `milestone.create`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
```

Payload example:

```json
{
  "title": "v1.0 Todo App MVP",
  "goal": "Deliver persistent task creation, completion, editing, and deletion."
}
```

## `artifact.read`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-artifact-read.json
```

Payload example:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements"
}
```

## `artifact.write`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-artifact-write.json
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


Use `<path-to-skill-directory>/scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
