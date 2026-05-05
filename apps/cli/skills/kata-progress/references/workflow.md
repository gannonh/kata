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
- An `Implementation Waves` section from `snapshot.roadmap.implementationWaves` when present. Show wave order and which slices in each wave can be planned or executed in parallel. Mention that waves normally run in sequence, while slices without dependency collisions can be explicitly selected out of wave order.
- An `Other Possible Actions` section showing command-shaped explicit overrides from `snapshot.otherActions` when present. Prefer slice targets when a missing requirement maps to a roadmap slice; show requirement targets only when the snapshot has no roadmap slice mapping for that requirement.

Example:

Recommended Next Action
- /kata-execute-phase S003

Implementation Waves
- Wave 1: S001
- Wave 2: S002, S003 (parallel)

Other Possible Actions
- /kata-plan-phase S004

## Rules

- Treat backend state as authoritative.
- Be explicit about missing project, milestone, slice, or task state.
- Put the snapshot's `nextAction` first as the recommended action.
- Include only state-backed explicit overrides from `snapshot.otherActions`; do not invent unrelated options.
