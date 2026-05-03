# Workflow Reference

# Complete Milestone Workflow

Use this workflow to complete the active release-sized milestone after all milestone slices and tasks are done and verified: check readiness, preserve summary/retrospective/archive artifacts, update project-scoped closeout artifacts, then transition the backend milestone lifecycle.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `references/ui-brand.md`
- `templates/milestone-archive.md`
- `templates/retrospective.md`

## Stage 1: Load Active Milestone

Read the project snapshot:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

Use `snapshot.readiness` and `snapshot.nextAction` as the source of truth for whether milestone completion is allowed. If `snapshot.nextAction.workflow` is not `kata-complete-milestone`, stop and report that exact next workflow, target, and reason.

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
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
node <path-to-skill-directory>/scripts/kata-call.mjs slice.list --input /tmp/kata-slice-list.json
```

For each slice, list tasks:

```json
{
  "sliceId": "S001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs task.list --input /tmp/kata-task-list.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-milestone-artifacts.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-requirements.json
```

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "roadmap"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-roadmap.json
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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-slice-plan.json
```

For each completed task, list/read summary and verification artifacts when needed:

```json
{
  "scopeType": "task",
  "scopeId": "T001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-task-artifacts.json
```

```json
{
  "scopeType": "task",
  "scopeId": "T001",
  "artifactType": "verification"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-task-verification.json
```

Use `project.getSnapshot`, `slice.list`, and `task.list` for readiness. Read task summaries and verification artifacts selectively when evidence is unclear, when a plan explicitly requires UAT, or when no later task has consolidated the milestone evidence. Do not spend time reading every task artifact when a verified consolidation artifact already covers the milestone evidence.

Review requirements, roadmap, slice plans, task summaries, verification artifacts, and any UAT artifacts that were explicitly required by a plan. Surface incomplete or failed work before asking to close the milestone.

Read project-scoped closeout artifacts. These live on the project tracking issue in backends that represent project artifacts that way.

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "project-brief"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-project-brief.json
```

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "requirements"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-project-requirements.json
```

If either project artifact is missing, stop before completion and ask whether to create the missing artifact from milestone evidence or repair project setup first.

## Stage 3: Confirm Completion Readiness

Before writing completion artifacts or completing the milestone, summarize:

- Active milestone ID and title.
- Completed slices.
- Verified tasks.
- Requirements covered.
- Known gaps, follow-up work, and carry-forward candidates from `snapshot.requirements.futureIds`.
- Whether this milestone includes a release action or only validates a pre-release slice.
- Project closeout updates that will be written to `PROJECT` project-scoped artifacts, including project brief changes, project requirements status/traceability changes, and preserved future requirements.

Ask for explicit confirmation to complete the milestone and update project artifacts.

Use `Kata > VERIFYING` for the readiness checkpoint and reserve `Kata > MILESTONE COMPLETE` for the final success output after `milestone.complete` succeeds.

If the milestone summary, retrospective, or project closeout artifacts already exist, enter idempotent closeout mode: read the existing content, preserve unchanged sections, and rewrite only the evidence-backed sections. Ask the user to confirm any carry-forward requirement reclassification before marking it validated.

If readiness is uncertain, stop and explain what remains.

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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-milestone-summary.json
```

Include a `## Carry-Forward Candidates` section in the summary when `snapshot.requirements.futureIds` is non-empty. Preserve each future requirement ID, its source milestone, and the reason it was deferred so `kata-new-milestone` can surface it during the next planning cycle.

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
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-retrospective.json
```

## Stage 6: Update Project Closeout Artifacts

Rewrite project artifacts with the latest durable project state. Preserve existing durable sections unless the completed milestone gives explicit evidence to update them. If the summary, retrospective, or project closeout artifacts already exist, read their current content first and update only the evidence-backed sections.

Update `project-brief` to include or refresh closeout sections such as:

- `## Current Status`
- `## Completed Milestones`
- `## Validated Outcomes`
- `## Open Questions`
- A last-updated note

Use milestone evidence to add one concise entry for the completed milestone. Do not paste the milestone archive wholesale into the project brief.

Create `/tmp/kata-PROJECT-project-brief.md` from the existing project brief plus the milestone closeout update, then generate the write payload:

```bash
node <path-to-skill-directory>/scripts/kata-artifact-input.mjs \
  --scope-type project \
  --scope-id PROJECT \
  --artifact-type project-brief \
  --title "PROJECT" \
  --content-file /tmp/kata-PROJECT-project-brief.md \
  --output /tmp/kata-PROJECT-project-brief.json
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-PROJECT-project-brief.json
```

Update project `requirements` to reflect milestone completion:

- Mark project-level requirements as complete or validated only when milestone evidence supports the change.
- Before reclassifying a carry-forward requirement as validated, ask for explicit confirmation and cite the evidence.
- Update traceability rows from pending to the completed milestone, slices, tasks, or verification artifacts that prove coverage.
- Preserve future requirements and carry-forward candidates, including their source milestone and deferred reason.
- Keep still-active requirements in the active section.

Create `/tmp/kata-PROJECT-requirements.md` from the existing project requirements plus the milestone closeout update, then generate the write payload:

```bash
node <path-to-skill-directory>/scripts/kata-artifact-input.mjs \
  --scope-type project \
  --scope-id PROJECT \
  --artifact-type requirements \
  --title "PROJECT Requirements" \
  --content-file /tmp/kata-PROJECT-requirements.md \
  --output /tmp/kata-PROJECT-requirements.json
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-PROJECT-requirements.json
```

If either project artifact write fails or returns `ok: false`, stop before `milestone.complete` and report the failed operation.

## Stage 7: Complete Milestone

Run this only after the milestone summary, milestone retrospective, project brief, and project requirements writes have succeeded.

```json
{
  "milestoneId": "M001",
  "summary": "Completed M001 after all milestone slices and tasks were done and verified."
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.complete --input /tmp/kata-milestone-complete.json
```

## Completion

Summarize the milestone outcome, known gaps, candidates for the next milestone, milestone artifacts written, and project artifacts updated. Report the changed artifact sections. Include project artifact provenance when the backend reports it, including the project tracking issue or URL when known and artifact comment ID.

End with:

```text
Next up: run `kata-new-milestone` to start the next cycle.
```

## Rules

- Do not complete a milestone with unverified required tasks unless the user explicitly accepts the risk.
- Do not complete a milestone before listing slices and tasks for the active milestone.
- Do not rely only on milestone-level artifacts; task verification artifacts live on task scope.
- Preserve follow-up work in artifact content or backend task state.
- Update project-scoped closeout artifacts before running `milestone.complete`.
- Stop before `milestone.complete` if a required project artifact read or write is missing or fails.
- Do not reclassify a carry-forward requirement as validated without explicit confirmation.
- Keep lifecycle transitions in the CLI backend contract.
