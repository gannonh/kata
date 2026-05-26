# Workflow Reference

# Update Project Workflow

Use this workflow to pause an in-flight Kata project and update durable project or active milestone artifacts without creating new execution scope.

## Required Reading

- `references/questioning.md`
- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `templates/project.md`
- `templates/requirements.md`
- `templates/roadmap.md`
- `templates/state.md`

## Stage 1: Load Current State

Check backend health when readiness is uncertain:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs health.check
```

Read project context:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

Read the project snapshot so update choices are grounded in current milestone, roadmap, slice, and task state:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

Read active milestone when one exists:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.getActive
```

List project-level artifacts:

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-PROJECT-artifacts.json
```

If there is an active milestone, list milestone artifacts:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.list --input /tmp/kata-M001-artifacts.json
```

## Stage 2: Choose Update Target

Ask interactively:

```text
What do you want to update?

1. Overall project context: project brief, project requirements, constraints, assumptions, decisions, or out-of-scope notes.
2. Current milestone: milestone requirements, roadmap, delivery constraints, scope changes, dependencies, or open questions.
3. Both project and current milestone: use when the new information changes durable project direction and the active milestone plan.
4. Another artifact: name the scope, artifact type, and requested change.
```

If the user already named the target, restate the inferred target and ask for confirmation only when the target is ambiguous or risky.

Use `references/questioning.md` to collect only the details needed for the chosen update:

- What changed?
- Why does it matter now?
- Which existing section or artifact should change?
- What should remain unchanged?
- Does this affect active requirements, future requirements, roadmap ordering, scope boundaries, risks, or open questions?
- Does any in-progress slice or task need to stop because the artifact update changes its premise?

If the requested change needs backend metadata mutation rather than artifact updates, stop and explain the limitation. This skill updates durable artifacts through the existing artifact contract.

## Stage 3: Read Existing Artifacts

Always read the existing artifact before writing an update. Do not overwrite from memory.

For project brief updates:

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

For project requirements updates:

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

For active milestone requirements updates:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-milestone-requirements.json
```

For active milestone roadmap updates:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "roadmap"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-milestone-roadmap.json
```

For another artifact, read exactly the artifact the user named:

```json
{
  "scopeType": "slice",
  "scopeId": "S001",
  "artifactType": "plan"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-read-named-artifact.json
```

If a requested artifact is missing, ask whether to create it from current project context or choose another target. Do not create missing artifacts silently.

## Stage 4: Draft the Update

Draft the revised artifact content in Markdown.

Preserve unchanged sections, headings, requirement IDs, roadmap labels, traceability rows, and source evidence. Change only the parts needed to reflect the user-approved update.

When updating project-level artifacts:

- Use `templates/project.md` and `templates/requirements.md` as shape references.
- Preserve durable project identity, core value, target users, key decisions, active assumptions, out-of-scope boundaries, and open questions unless the user explicitly changes them.
- Record new durable context in the existing section when possible.
- Move requirements between active, future, validated, or out-of-scope sections only with explicit user confirmation.

When updating active milestone artifacts:

- Use `templates/requirements.md`, `templates/roadmap.md`, and `templates/state.md` as shape references.
- Keep milestone scope specific and testable.
- Preserve backend slice IDs that already exist.
- If roadmap dependencies or implementation waves change, update the slice map, dependency graph, and traceability together.
- If current slice or task work may be invalidated, surface the risk and stop before writing unless the user confirms the update.

Show a concise diff-style summary before writing:

```text
Kata > UPDATE REVIEW

Target artifacts:
- project / PROJECT / project-brief
- milestone / M001 / roadmap

Planned changes:
- Add decision: use GitHub Issues as the source for backlog items.
- Move REQ-04 from Future Requirements to Active Requirements.
- Update roadmap dependency: Planned Slice 3 now blocks Planned Slice 4.

Unchanged:
- Core value
- Milestone goal
- Existing backend slice IDs

Confirm write? [yes/no]
```

Do not write until the user confirms the exact artifact updates.

## Stage 5: Write Updated Artifacts

Prefer `scripts/kata-artifact-input.mjs` for multi-line Markdown content.

Example project brief write:

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

Example milestone roadmap write:

```bash
node <path-to-skill-directory>/scripts/kata-artifact-input.mjs \
  --scope-type milestone \
  --scope-id M001 \
  --artifact-type roadmap \
  --title "M001 Roadmap" \
  --content-file /tmp/kata-M001-roadmap.md \
  --output /tmp/kata-M001-roadmap.json
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-M001-roadmap.json
```

For single-line or generated payloads, the contract shape is:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements",
  "title": "M001 Requirements",
  "content": "# Requirements\n\n...",
  "format": "markdown"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-M001-requirements.json
```

If any `artifact.write` returns `ok: false`, stop and report the failed artifact. Do not proceed to later writes as if the update succeeded.

## Stage 6: Reload and Report

Reload the project snapshot:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getSnapshot
```

Report:

- Which artifacts changed.
- Which sections changed.
- Any active milestone, roadmap, slice, or task implications.
- The reloaded snapshot's recommended next workflow when available.

End with one of:

```text
Next up: resume the snapshot's recommended workflow: `kata-plan-phase`.
```

```text
Next up: resume the snapshot's recommended workflow: `kata-execute-phase`.
```

```text
Next up: run `kata-progress` if you want a read-only status check after the update.
```

## Rules

- This skill is for in-flight project correction and artifact maintenance.
- Preserve unchanged sections and IDs unless the user approves changing them.
- Do not create a new milestone.
- Do not create milestones, slices, tasks, issues, or milestone completions.
- Do not execute implementation work.
- Do not update task verification state.
- Do not skip reading existing artifacts before writing replacements.
- Do not silently reinterpret old requirements; surface changed meaning and ask for confirmation.
- Keep backend-specific details in CLI adapters and use only typed runtime operations.
