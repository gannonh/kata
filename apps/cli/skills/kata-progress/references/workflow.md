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

Read the project snapshot:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

Use the snapshot as the source of truth for active milestone, roadmap coverage, slice/task state, readiness, the recommended next action, and other possible explicit actions.

Read active milestone only when you need additional raw milestone detail:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
```

List slices only when you need additional raw slice detail:

```json
{
  "milestoneId": "M001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

List tasks for each slice only when you need additional raw task detail:

```json
{
  "sliceId": "S001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

List artifact inventory only when you need additional raw artifact detail:

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
- A `Recommended Next Action` section showing exactly one command-shaped action from `snapshot.nextAction`.
- An `Other Possible Actions` section showing command-shaped explicit overrides from `snapshot.otherActions` when present.

Example:

Recommended Next Action
- /kata-execute-phase S003

Other Possible Actions
- /kata-plan-phase S004

## Rules

- Treat backend state as authoritative.
- Be explicit about missing project, milestone, slice, or task state.
- Put the snapshot's `nextAction` first as the recommended action.
- Include only state-backed explicit overrides from `snapshot.otherActions`; do not invent unrelated options.
