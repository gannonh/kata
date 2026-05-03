# Runtime Contract

Use only these typed runtime operations:

## `project.getContext`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

## `health.check`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
```

## `issue.listOpen`

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.listOpen
```

## `issue.get`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.get --input /tmp/kata-issue-get.json
```

Payload example:

```json
{
  "issueRef": "I001"
}
```

## `issue.updateStatus`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.updateStatus --input /tmp/kata-issue-updateStatus.json
```

Payload example:

```json
{
  "issueId": "I001",
  "status": "in_progress"
}
```


Use `<path-to-skill-directory>/scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
