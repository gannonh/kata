# Runtime Contract

Use only these typed runtime operations:

## `health.check`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
```

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

## `milestone.getActive`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
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
