# Workflow Reference

Source: `apps/cli/skills-src/workflows/execute-phase.md`

# Execute Phase Workflow

Use this workflow to execute planned slice tasks through the active Kata backend state. This adapts the legacy wave execution flow for portable harnesses: load the active plan, select executable tasks, perform code work, verify evidence, and persist summary artifacts.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/summary.md`

## Stage 1: Load Execution Context

Read project context:

```bash
node ./scripts/kata-call.mjs project.getContext
```

Read active milestone:

```bash
node ./scripts/kata-call.mjs milestone.getActive
```

List slices:

```json
{
  "milestoneId": "M001"
}
```

```bash
node ./scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

For each selected slice, list tasks:

```json
{
  "sliceId": "S001"
}
```

```bash
node ./scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
```

Read the plan artifact:

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "plan"
}
```

```bash
node ./scripts/kata-call.mjs artifact.read --input /tmp/kata-read-plan.json
```

## Stage 2: Select Work

Pick the next `todo` task unless the user explicitly selects another task. Present:

- Task ID and title.
- Plan context.
- Expected verification.
- Files or subsystems likely affected.

## Stage 3: Mark Task In Progress

```json
{
  "taskId": "T001",
  "status": "in_progress"
}
```

```bash
node ./scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-in-progress.json
```

## Stage 4: Execute And Verify

Perform the repository code work. Run the verification commands implied by the plan or by project conventions. Evidence comes before claims.

## Stage 5: Write Summary Artifact

Use `templates/summary.md`.

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "summary",
  "title": "T001 Summary",
  "content": "# Summary: Implement task model\n\n## What Changed\n\n...",
  "format": "markdown"
}
```

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-task-summary.json
```

## Stage 6: Complete Or Leave In Progress

If verification passed:

```json
{
  "taskId": "T001",
  "status": "done",
  "verificationState": "verified"
}
```

```bash
node ./scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-done.json
```

If verification failed, keep the task `in_progress`, set `verificationState` to `failed`, and write failure evidence with `artifact.write`.

## Completion

Summarize completed tasks, verification evidence, remaining tasks, and the next action:

```text
Next up: run `kata-verify-work` for user-facing verification.
```

## Rules

- Do not bypass the CLI when reading or mutating Kata state.
- Do not claim completion without verification evidence.
- If autonomous dispatch is required, use Symphony in the Symphony validation phase; do not invent a local runner here.
