# Plan Phase Workflow

Use this workflow to turn the active milestone roadmap into executable slices and tasks: load context, clarify approach, derive execution plans from requirements, create backend tasks, and write plan artifacts.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/phase-prompt.md`

## Stage 1: Load Active Milestone

Read project context:

```bash
node ./scripts/kata-call.mjs project.getContext
```

Run:

```bash
node ./scripts/kata-call.mjs milestone.getActive
```

If no active milestone exists, stop and route to `kata-new-milestone`.

Read requirements:

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

Read roadmap:

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

List existing milestone slices before proposing new backend work:

```json
{
  "milestoneId": "M001"
}
```

```bash
node ./scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

Use the returned slices to avoid creating duplicate backend slices for roadmap work that is already planned.

## Stage 2: Phase Gate

Present the phase or roadmap slice you plan to convert into executable work:

- Goal.
- Requirements covered.
- Success criteria.
- Existing slice coverage, if any.
- Known constraints.
- Assumptions.

Ask for confirmation before creating backend slices/tasks. This is the phase gate.

## Stage 3: Create Slice

If an existing slice already covers the selected roadmap work, do not create a duplicate. Confirm whether to add missing tasks or update the slice-scoped plan artifact instead.

Create `/tmp/kata-slice-create.json`:

```json
{
  "milestoneId": "M001",
  "title": "Task Foundation",
  "goal": "Create the data model and UI shell for task management.",
  "order": 1
}
```

Run:

```bash
node ./scripts/kata-call.mjs slice.create --input /tmp/kata-slice-create.json
```

Capture the returned slice ID, for example `S001`.

## Stage 4: Create Tasks

For each execution task, create a payload:

```json
{
  "sliceId": "S001",
  "title": "Implement task model",
  "description": "Create the task data model with create, update, complete, and delete behavior plus tests."
}
```

Run:

```bash
node ./scripts/kata-call.mjs task.create --input /tmp/kata-task-create.json
```

Tasks should be small enough for a fresh execution agent and include verification notes in the description.

## Stage 5: Write Plan Artifact

Use `templates/phase-prompt.md`.

Create `/tmp/kata-plan-artifact.json`:

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "plan",
  "title": "S001 Plan",
  "content": "# Plan: Task Foundation\n\n## Goal\n\n...",
  "format": "markdown"
}
```

Run:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-plan-artifact.json
```

## Completion

Summarize:

- Slice ID.
- Created task IDs.
- Requirements covered.
- Verification expectations.

End with:

```text
Next up: run `kata-execute-phase` to execute the planned tasks.
```

## Rules

- Derive tasks from requirements and success criteria.
- List existing slices before creating new backend slices.
- Do not create duplicate slices for roadmap work that already has backend slice coverage.
- Do not create tasks that are not tied to the milestone goal.
- Keep discussion integrated in this workflow; do not route to standalone discuss skills.
