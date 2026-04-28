# Runtime Contract

Use only these typed runtime operations:

## `milestone.getActive`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
```

## `milestone.complete`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.complete --input /tmp/kata-milestone-complete.json
```

Payload example:

```json
{
  "milestoneId": "M001",
  "summary": "The milestone shipped and passed verification."
}
```

## `slice.list`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

Payload example:

```json
{
  "milestoneId": "M001"
}
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
