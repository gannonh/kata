# Runtime Contract

Use only these typed runtime operations:

- `project.getContext`
- `milestone.getActive`
- `slice.list`
- `task.list`
- `artifact.list`
- `execution.getStatus`

Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
