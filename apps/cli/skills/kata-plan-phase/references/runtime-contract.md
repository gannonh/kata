# Runtime Contract

Use only these typed runtime operations:

## `project.getContext`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

## `milestone.getActive`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
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

## `slice.create`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.create --input /tmp/kata-slice-create.json
```

Payload example:

```json
{
  "milestoneId": "M001",
  "title": "Task persistence",
  "goal": "Persist tasks across app reloads.",
  "order": 1
}
```

## `task.create`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.create --input /tmp/kata-task-create.json
```

Payload example:

```json
{
  "sliceId": "S001",
  "title": "Add task model",
  "description": "Implement the task persistence model and tests."
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
