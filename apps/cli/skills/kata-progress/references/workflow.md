# Workflow Reference

# Progress Workflow

Use this workflow to summarize current Kata project, milestone, slice, task, artifact, and execution state.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`

## Flow

Read project context:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

Read active milestone:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
```

List slices:

```json
{
  "milestoneId": "M001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

List tasks for each slice:

```json
{
  "sliceId": "S001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

List artifact inventory:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-artifact-list.json
```

Read execution status:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs execution.getStatus
```

## Summary Format

Report:

- Project/repository.
- Active milestone.
- Slice/task counts by status.
- Verification state.
- Missing artifacts.
- One recommended next action.

## Rules

- Treat backend state as authoritative.
- Be explicit about missing project, milestone, slice, or task state.
- Recommend one next action, not a menu of unrelated options.
