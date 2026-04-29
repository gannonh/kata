# Workflow Reference

# New Milestone Workflow

Use this workflow to start a scoped delivery cycle for an existing Kata project: gather "what's next", define requirements, create the milestone, write roadmap artifacts, then route to `kata-plan-phase`.

## Required Reading

- `references/questioning.md`
- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `templates/requirements.md`
- `templates/roadmap.md`
- `templates/state.md`

## Stage 1: Load Project Context

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs project.getContext
```

List existing milestones so completed milestone artifacts can seed the next cycle:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.list
```

Read project brief when available:

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

If the project brief is missing, ask the user whether to continue from conversation context or run `kata-new-project` first.

For the most recent completed milestone, read milestone summary and retrospective artifacts when available:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "summary"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-M001-read-summary.json
```

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "retrospective"
}
```

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.read --input /tmp/kata-M001-read-retrospective.json
```

Surface any `Carry-Forward Candidates`, `Future Requirements`, deferred requirements, or follow-up IDs from completed milestone artifacts before asking the user to confirm the new milestone scope.

## Stage 2: Gather Milestone Goal

Use `references/questioning.md`, but focus on what changes in this milestone:

- Milestone title.
- Goal.
- Target features.
- Carry-forward candidates to include, defer again, or drop.
- Success criteria.
- Constraints.
- Out of scope.
- Risks or sequencing tradeoffs.

Ask:

```text
What do you want to build next?
```

Use a decision gate before creating the milestone.

## Stage 3: Define Requirements

Use `templates/requirements.md`.

Requirements must be:

- Specific and testable.
- User-centric.
- Atomic.
- Scoped to this milestone.

Present the full requirements list for confirmation before writing it.

If the user accepts carry-forward candidates into this milestone, move them into `## Active Requirements` with updated IDs or preserved IDs. If the user defers them again, keep them under `## Future Requirements` and explain why they remain non-blocking for this milestone.

## Stage 4: Create Milestone

Create `/tmp/kata-milestone-create.json`:

```json
{
  "title": "v1.0 Todo App MVP",
  "goal": "Deliver persistent task creation, completion, editing, and deletion."
}
```

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs milestone.create --input /tmp/kata-milestone-create.json
```

Capture the returned milestone ID, for example `M001`. Use that exact ID for all milestone-scoped artifacts.

## Stage 5: Write Requirements Artifact

Create `/tmp/kata-milestone-requirements.json`:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "requirements",
  "title": "M001 Requirements",
  "content": "# Requirements: v1.0 Todo App MVP\n\n## Active Requirements\n\n- [ ] **TODO-01**: User can create a task.",
  "format": "markdown"
}
```

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-milestone-requirements.json
```

## Stage 6: Write Roadmap Artifact

Use `templates/roadmap.md` to derive a phase/slice roadmap from the requirements.

Create `/tmp/kata-milestone-roadmap.json`:

```json
{
  "scopeType": "milestone",
  "scopeId": "M001",
  "artifactType": "roadmap",
  "title": "M001 Roadmap",
  "content": "# Roadmap: v1.0 Todo App MVP\n\n## Slices / Phases\n\n### Phase 1: Task Foundation\n\n...",
  "format": "markdown"
}
```

Run:

```bash
node <path-to-skill-directory>/scripts/kata-call.mjs artifact.write --input /tmp/kata-milestone-roadmap.json
```

## Completion

Summarize:

- Milestone ID and title.
- Requirement count.
- Roadmap phases/slices.
- Open risks.

End with:

```text
Next up: run `kata-plan-phase` to turn the roadmap into executable slices and tasks.
```

## Rules

- Create exactly one active milestone unless the user explicitly asks for multiple.
- Keep discussion integrated in this workflow.
- Persist durable decisions through the CLI artifact contract.
