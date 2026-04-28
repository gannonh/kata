# Runtime Contract

Use only these typed runtime operations:

- `project.getContext`
- `milestone.getActive`
- `slice.create`
- `task.create`
- `artifact.write`

Use `scripts/kata-call.mjs <operation> --input <request.json>` when a harness benefits from a local helper.
