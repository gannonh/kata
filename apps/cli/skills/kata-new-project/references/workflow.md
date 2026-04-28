# Workflow Reference

Source: `apps/cli/skills-src/workflows/new-project.md`

# New Project Workflow

Use this workflow to initialize Kata project-level context and then route the user to `kata-new-milestone`.

## Alignment Overlay

- `fast`: ask for project name and one-sentence outcome.
- `guided`: ask for project name, outcome, target users, constraints, and acceptance signal.
- `deep`: additionally explore risks, non-goals, and first milestone candidates.

## Runtime Flow

1. Run health check through `scripts/kata-call.mjs health.check`.
2. Create or update project context with `project.upsert`.
3. Write project-level artifacts with `artifact.write`.
4. Include, when available, `project-brief` and `requirements` artifacts.
5. Do not create a milestone in this workflow.
6. Conclude with the next step: run `kata-new-milestone`.

## Backend IO

All durable reads and writes use `scripts/kata-call.mjs`. The skill may ask clarifying questions, but it must not store durable project state outside the CLI backend contract.
