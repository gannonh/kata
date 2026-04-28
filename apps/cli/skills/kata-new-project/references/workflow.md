# Workflow Reference

Source: `apps/cli/skills-src/workflows/new-project.md`

# New Project Workflow

Use this workflow to initialize durable Kata project context. This is the backend-artifact replacement for the legacy `new-project` flow's deep questioning and `PROJECT.md` synthesis.

This workflow does not create a milestone. It ends by routing the user to `kata-new-milestone`.

## Required Reading

- `references/questioning.md`
- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `templates/project.md`
- `templates/requirements.md`

## Stage 1: Health Check

Run this once before durable writes:

```bash
node ./scripts/kata-call.mjs health.check
```

If the response is `ok: false`, stop and fix setup. If it is healthy or warning-only, continue.

## Stage 2: Questioning

Use `references/questioning.md`. Start open:

```text
What do you want to build?
```

Follow the user's thread until you can write a useful project artifact. Capture:

- Project name.
- What this is.
- Core value.
- Target users.
- Active requirement hypotheses.
- Out of scope.
- Constraints.
- Key decisions.
- Open questions.

Use the decision gate from `references/questioning.md` before writing durable state.

## Stage 3: Upsert Project

Create `/tmp/kata-project-upsert.json`:

```json
{
  "title": "Todo App",
  "description": "A focused app for tracking personal tasks through a clean web UI."
}
```

Run:

```bash
node ./scripts/kata-call.mjs project.upsert --input /tmp/kata-project-upsert.json
```

If the command returns `ok: false`, stop and fix the payload or backend issue.

## Stage 4: Write Project Brief

Use `templates/project.md` to synthesize the durable project brief.

Create `/tmp/kata-project-brief.json`:

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "project-brief",
  "title": "PROJECT",
  "content": "# Todo App\n\n## What This Is\n\n...",
  "format": "markdown"
}
```

Run:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-project-brief.json
```

## Stage 5: Write Initial Requirements When Available

If questioning surfaced concrete requirement hypotheses, use `templates/requirements.md` and write a project-scoped requirements artifact.

Create `/tmp/kata-project-requirements.json`:

```json
{
  "scopeType": "project",
  "scopeId": "PROJECT",
  "artifactType": "requirements",
  "title": "PROJECT Requirements",
  "content": "# Requirements: Todo App\n\n## Active Requirements\n\n- [ ] **TODO-01**: User can create a task.",
  "format": "markdown"
}
```

Run:

```bash
node ./scripts/kata-call.mjs artifact.write --input /tmp/kata-project-requirements.json
```

## Completion

Summarize what was persisted:

- Project identity.
- Project brief artifact.
- Requirements artifact, if written.
- Open questions.

End with:

```text
Next up: run `kata-new-milestone` to define the first milestone.
```

## Rules

- Keep discussion inside this workflow; do not route to standalone discussion skills.
- Do not create a milestone here.
- Do not store durable state outside the CLI backend contract.
