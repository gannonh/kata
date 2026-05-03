# Runtime Contract

Use only these typed runtime operations:

## `project.getContext`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

## `project.getSnapshot`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

## `task.list`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

Payload example:

```json
{
  "sliceId": "S001"
}
```

## `task.updateStatus`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-updateStatus.json
```

Payload example:

```json
{
  "taskId": "T001",
  "status": "done",
  "verificationState": "verified"
}
```

## `artifact.list`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-artifact-list.json
```

Payload example:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
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
