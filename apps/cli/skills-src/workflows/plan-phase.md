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

Read the project snapshot:

```bash
node ./scripts/kata-call.mjs project.getSnapshot
```

Use `snapshot.nextAction` to select the next roadmap slice to plan by default. If the user explicitly targets a requirement ID such as `E2E-08`, resolve that requirement through `snapshot.roadmap.requirementToSliceIds` first:

- If the requirement maps to one or more roadmap slices, plan the mapped slice that is missing or not yet complete.
- If the requirement is already covered by an existing slice, do not create duplicate scope; report the existing slice and its state.
- If the requirement has no roadmap slice mapping, propose where it should fit in the roadmap before creating backend state.

If the snapshot recommends a workflow other than `kata-plan-phase`, explain that concrete state before honoring any explicit planning override.

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

Inspect `snapshot.roadmap.sliceDependencies` and the selected roadmap/backend slice metadata before creating a slice. Resolve dependencies to canonical backend slice IDs such as `S001`. If the selected roadmap work depends on existing slices, include those IDs in the eventual `slice.create` payload as `blockedBy`. If dependency data is unknown, ambiguous, or names work that has no backend slice ID yet, ask at the phase gate before creating backend state.

## Stage 2: Phase Gate

Present the phase or roadmap slice you plan to convert into executable work:

- Goal.
- Requirements covered.
- Success criteria.
- Existing slice coverage, if any.
- Dependency metadata from `snapshot.roadmap.sliceDependencies`, roadmap text, and existing backend slices.
- Known constraints.
- Assumptions.

Ask for confirmation before creating backend slices/tasks. This is the phase gate. Resolve dependency questions here. Do not create backend state while selected work has unknown or ambiguous dependencies.

## Stage 3: Create Slice

If an existing slice already covers the selected roadmap work, do not create a duplicate. Confirm whether to add missing tasks or update the slice-scoped plan artifact instead.

Before `slice.create`, carry forward resolved dependency graph metadata. When the selected roadmap work depends on existing slices, create `/tmp/kata-slice-create.json` with `blockedBy` set to canonical slice IDs:

```json
{
  "milestoneId": "M001",
  "title": "Task Foundation",
  "goal": "Create the data model and UI shell for task management.",
  "order": 1,
  "blockedBy": ["S001", "S002"]
}
```

When the selected roadmap work has no dependencies, omit `blockedBy` or use an empty list only if the backend contract requires it.

Run:

```bash
node ./scripts/kata-call.mjs slice.create --input /tmp/kata-slice-create.json
```

Capture the returned slice ID, for example `S003`. Record or retain machine-readable dependency metadata in the roadmap and plan artifacts once backend slice IDs are known.

## Stage 4: Create Tasks

For each execution task, create a payload:

```json
{
  "sliceId": "S003",
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
  "scopeId": "S003",
  "artifactType": "plan",
  "title": "S003 Plan",
  "content": "# Plan: Task Foundation\n\n## Goal\n\n...",
  "format": "markdown"
}
```

Run:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-plan-artifact.json
```

## Completion

Reload the project snapshot after creating or updating backend planning state:

```bash
node ./scripts/kata-call.mjs project.getSnapshot
```

Summarize:

- Slice ID.
- Created task IDs.
- Requirements covered.
- Verification expectations.
- Snapshot recommended next action.
- Any important explicit-override note, for example when the user planned a later slice while an earlier slice still has execution work.

End with the reloaded snapshot's next action, not an assumption that the slice just planned should execute next. Example:

Next up
- /kata-execute-phase S003

Note: S004 is planned Backlog work. Snapshot still recommends executing S003 first because it has execution work remaining.

## Rules

- Derive tasks from requirements and success criteria.
- List existing slices before creating new backend slices.
- Do not create duplicate slices for roadmap work that already has backend slice coverage.
- Do not create tasks that are not tied to the milestone goal.
- Keep discussion integrated in this workflow; do not route to standalone discuss skills.
