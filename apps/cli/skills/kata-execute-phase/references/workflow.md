# Workflow Reference

# Execute Phase Workflow

Use this workflow to execute one approved slice through the active Kata backend state: load the active plan, complete every executable task in the slice, run execution checks, and persist summary artifacts.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/summary.md`

## Stage 1: Load Execution Context

Read project context:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

Read the project snapshot:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

Use `snapshot.nextAction` and slice/task state to choose the executable slice. If the snapshot recommends `kata-plan-phase` or `kata-verify-work`, stop and report that concrete next step instead of executing stale or duplicate scope.

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

For each selected slice, list tasks:

```json
{
  "sliceId": "S001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-plan.json
```

## Stage 2: Select Slice And Confirm Execution Approval

Present the selected slice and all executable task work before mutating execution state:

- Slice ID, title, and current status.
- Task IDs and titles.
- Plan context.
- Expected execution checks.
- Files or subsystems likely affected.

If the selected slice is `backlog`, ask for explicit confirmation that this slice is approved for execution. Do not move a Backlog slice forward without that confirmation.

If the selected slice is already `todo`, treat it as approved for execution.

If the selected slice is already `in_progress`, continue from the current execution state.

## Stage 3: Mark Slice In Progress

If the selected slice was `backlog`, first mark it `todo` to record execution approval:

```json
{
  "sliceId": "S001",
  "status": "todo"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.updateStatus --input /tmp/kata-slice-approved.json
```

Then mark the selected slice `in_progress` when work starts:

```json
{
  "sliceId": "S001",
  "status": "in_progress"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.updateStatus --input /tmp/kata-slice-in-progress.json
```

For each executable task in the selected slice, mark that task `in_progress` when work starts:

```json
{
  "taskId": "T001",
  "status": "in_progress"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-in-progress.json
```

## Stage 4: Execute And Check

Before changing files, run `git status --short` and identify any pre-existing user changes. Do not stage or commit unrelated user changes.

Perform the repository code work for the current task. Run the execution checks implied by the plan or by project conventions. Evidence comes before claims.

After execution checks pass, run `git status --short` again:

- If repository files changed for this task, create one atomic commit containing only the task-scoped changes before marking the task done.
- Use a conventional commit message that includes the task ID, for example `test(T001): verify project initialization artifacts`.
- If no repository files changed, do not create an empty commit; record "no code commit required" with the evidence in the summary artifact.
- Do not commit Kata backend artifacts directly. Durable Kata artifacts are persisted through `artifact.write`.
- If unrelated pre-existing user changes are present, leave them unstaged and mention them in the summary.

## Stage 5: Write Summary Artifact For Each Task

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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-task-summary.json
```

## Stage 6: Complete Each Task Or Leave It In Progress

If execution checks passed:

Mark the current task done and leave verification pending for `kata-verify-work`:

```json
{
  "taskId": "T001",
  "status": "done",
  "verificationState": "pending"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.updateStatus --input /tmp/kata-task-done.json
```

Repeat stages 3 through 6 for every executable task in the selected slice.

If all tasks for the slice are complete, mark the slice done. Task verification remains owned by `kata-verify-work`.

```json
{
  "sliceId": "S001",
  "status": "done"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs slice.updateStatus --input /tmp/kata-slice-done.json
```

If execution checks failed, keep the task `in_progress`, leave `verificationState` as `pending`, and write failure evidence with `artifact.write`.

## Completion

Summarize all completed slice tasks, execution-check evidence, remaining tasks, and the next action:

```text
Next up: run `kata-verify-work` to record verification evidence.
```

## Rules

- Do not bypass the CLI when reading or mutating Kata state.
- Do not execute Backlog slices without an explicit execution approval checkpoint.
- The slice is the primary execution unit. After a slice is approved, execute every executable task in that slice before routing to `kata-verify-work`.
- Use the shared execution lifecycle for approved slices: `todo` -> `in_progress` -> `agent_review` -> `human_review` -> `merging` -> `done` as far as the current validated path requires.
- Preserve atomic commits: one task-scoped code commit per completed task when repository files changed.
- Never stage or commit unrelated user changes.
- `kata-execute-phase` must not set `verificationState: verified`; `kata-verify-work` owns that transition.
- Mark a task done only after execution-check evidence exists and the task-scoped code commit has been created, or after the summary records why no code commit was required.
- Do not claim execution completion without execution-check evidence.
- If autonomous dispatch is required, use Symphony in the Symphony validation phase; do not invent a local runner here.
