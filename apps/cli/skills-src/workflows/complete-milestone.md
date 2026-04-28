# Complete Milestone Workflow

Use this workflow to complete the active release-sized milestone after all milestone slices and tasks are done and verified: check readiness, preserve summary/retrospective/archive artifacts, then transition the backend milestone lifecycle.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/milestone-archive.md`
- `templates/retrospective.md`

## Stage 1: Load Active Milestone

```bash
node ./scripts/kata-call.mjs milestone.getActive
```

If no active milestone exists, stop and report that there is nothing to complete.

## Stage 2: Read Completion Evidence

List slices for the active milestone:

```json
{
  "milestoneId": "M001"
}
```

```bash
node ./scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

For each slice, list tasks:

```json
{
  "sliceId": "S001"
}
```

```bash
node ./scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

Stop before completion if any slice is not `done`, any task is not `done`, or any task has `verificationState` other than `verified`.

List milestone artifacts:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
}
```

```bash
node ./scripts/kata-call.mjs artifact.list --input /tmp/kata-milestone-artifacts.json
```

Read milestone requirements and roadmap:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-requirements.json
```

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "roadmap"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-roadmap.json
```

For each completed slice, list/read the slice plan artifact when needed:

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "plan"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-slice-plan.json
```

For each completed task, list/read summary and verification artifacts when needed:

```json
{
  "scopeType": "task",
  "scopeId": "T001"
}
```

```bash
node ./scripts/kata-call.mjs artifact.list --input /tmp/kata-task-artifacts.json
```

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "verification"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-task-verification.json
```

Review requirements, roadmap, slice plans, task summaries, verification artifacts, and any UAT artifacts that were explicitly required by a plan. Surface incomplete or failed work before asking to close the milestone.

## Stage 3: Confirm Completion Readiness

Before writing completion artifacts or completing the milestone, summarize:

- Active milestone ID and title.
- Completed slices.
- Verified tasks.
- Requirements covered.
- Known gaps and follow-up work.
- Whether this milestone includes a release action or only validates a pre-release slice.

Ask for explicit confirmation to complete the milestone. If readiness is uncertain, stop and explain what remains.

## Stage 4: Write Summary Artifact

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "summary",
  "title": "M001 Summary",
  "content": "# Summary\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-milestone-summary.json
```

## Stage 5: Write Retrospective Artifact

Use `templates/retrospective.md`.

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "retrospective",
  "title": "M001 Retrospective",
  "content": "# Retrospective: M001\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-retrospective.json
```

## Stage 6: Complete Milestone

```json
{
  "milestoneId": "M001",
  "summary": "Completed M001 after all milestone slices and tasks were done and verified."
}
```

```bash
node ./scripts/kata-call.mjs milestone.complete --input /tmp/kata-milestone-complete.json
```

## Completion

Summarize the milestone outcome, known gaps, and candidates for the next milestone.

End with:

```text
Next up: run `kata-new-milestone` to start the next cycle.
```

## Rules

- Do not complete a milestone with unverified required tasks unless the user explicitly accepts the risk.
- Do not complete a milestone before listing slices and tasks for the active milestone.
- Do not rely only on milestone-level artifacts; task verification artifacts live on task scope.
- Preserve follow-up work in artifact content or backend task state.
- Keep lifecycle transitions in the CLI backend contract.
