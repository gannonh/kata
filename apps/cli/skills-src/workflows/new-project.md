# New Project Workflow

Initialize durable Kata project context.

This skill owns project identity, project brief, and initial project requirements. Milestone goals, roadmap, slices, and executable tasks are created by `kata-new-milestone` and later skills.

This workflow does not create a milestone. It ends by routing the user to `kata-new-milestone`.

## Required Reading

- `references/setup.md`
- `references/questioning.md`
- `references/cli-runtime.md`
- `references/artifact-contract.md`
- `templates/project.md`
- `templates/requirements.md`

## Stage 1: Decide Whether You Have Enough Input

If the user provided a clear project brief, PRD, or pasted idea, use that as source material and ask only for missing essentials.

If the user only invoked the skill or gave a vague idea, start freeform:

```text
What do you want to build?
```

Do not begin with a rigid checklist. Follow the user's thread using `references/questioning.md`.

## Stage 2: Health Check

Run this once before durable writes:

```bash
node ./scripts/kata-call.mjs health.check
```

If the response is `ok: false`, stop and fix setup. If it is healthy or warning-only, continue.

## Stage 3: Project Discovery

Use the project discovery style:

- Be a thinking partner, not an interviewer.
- Challenge vague answers.
- Make abstract ideas concrete.
- Follow energy in the user's answer.
- Use choice prompts only when choices help the user think.
- Stop using choice prompts when the user wants to explain freely.

Capture enough context for downstream milestone planning:

- Project name.
- What this is.
- Core value.
- Target users.
- Active requirement hypotheses.
- Out of scope.
- Constraints.
- Key decisions.
- Open questions.

If this is an existing codebase, ask whether to treat it as brownfield. For Phase A, do not invoke a separate map-codebase flow. Inspect only enough repository context to describe current capabilities and constraints, then capture those in the project brief.

If the user asks for auto/document-driven initialization, extract the same fields from the supplied document. Ask only for blocking gaps.

## Stage 4: Decision Gate

Before durable writes, present a concise synthesized brief:

```text
I think the project is:

- Name:
- What this is:
- Core value:
- Target users:
- Active requirement hypotheses:
- Out of scope:
- Constraints:
- Key decisions:
- Open questions:

Ready for me to initialize this Kata project?
```

If the user wants to keep exploring, continue questioning. Do not write durable state until the user confirms.

## Stage 5: Upsert Project

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

## Stage 6: Write Project Brief

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

The content must preserve the user's language and the decisions made during discovery. Do not compress away context that future milestone planning will need.

## Stage 7: Write Initial Requirements When Available

If questioning surfaced concrete requirement hypotheses, use `templates/requirements.md` and write a project-scoped requirements artifact.

Requirements must be:

- Specific and testable.
- User-centric.
- Atomic.
- Independent enough to plan and verify.

Reject vague requirements and rewrite them with the user before persisting.

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

If the project is still too early for requirements, do not force them. Put unresolved requirement questions in the project brief and mention that `kata-new-milestone` will refine scope.

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
- Do not create roadmap, slices, tasks, or execution plans here.
- Do not store durable state outside the CLI backend contract.
- Do not write durable state outside the CLI backend contract.
- Do not skip the decision gate unless the user explicitly requested auto/document-driven initialization and supplied enough source material.
