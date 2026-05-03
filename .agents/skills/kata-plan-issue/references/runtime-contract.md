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

## `issue.create`

Create a JSON payload file first, then run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs issue.create --input /tmp/kata-issue-create.json
```

Payload example:

```json
{
  "title": "Fix first-run setup messaging",
  "design": "Clarify the user-facing setup states and accepted install targets.",
  "plan": "1. Add focused tests for the CLI output.\n2. Update the setup renderer.\n3. Run CLI validation."
}
```


Use `<path-to-skill-directory>/scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
