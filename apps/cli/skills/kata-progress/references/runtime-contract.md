# Runtime Contract

Use only these typed runtime operations:

## `project.getContext`

Run:

```bash
node ./scripts/kata-call.mjs project.getContext
```

## `milestone.getActive`

Run:

```bash
node ./scripts/kata-call.mjs milestone.getActive
```

## `slice.list`

Create a JSON payload file first, then run:

```bash
node ./scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
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
node ./scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
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
node ./scripts/kata-call.mjs artifact.list --input /tmp/kata-artifact-list.json
```

Payload example:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
}
```

## `execution.getStatus`

Run:

```bash
node ./scripts/kata-call.mjs execution.getStatus
```


Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
