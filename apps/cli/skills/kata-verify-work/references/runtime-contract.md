# Runtime Contract

Use only these typed runtime operations:

- `project.getContext`
- `task.list`
- `task.updateStatus`
- `artifact.list`
- `artifact.read`
- `artifact.write`

Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
