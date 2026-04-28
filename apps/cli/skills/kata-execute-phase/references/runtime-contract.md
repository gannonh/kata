# Runtime Contract

Use only these typed runtime operations:

- `project.getContext`
- `milestone.getActive`
- `slice.list`
- `task.list`
- `task.updateStatus`
- `artifact.read`
- `artifact.write`

Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
