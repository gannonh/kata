# Plan Phase Workflow

Use this workflow to plan the next vertical slice in the active milestone.

## Alignment Overlay

- `fast`: plan the next obvious vertical slice.
- `guided`: confirm slice outcome, user-visible behavior, test evidence, and task boundaries.
- `deep`: compare alternate slices and choose the best next vertical increment.

## Runtime Flow

1. Read project context with `project.getContext`.
2. Read active milestone with `milestone.getActive`.
3. Create one vertical slice with `slice.create`.
4. Create executable tasks with `task.create`.
5. Write slice artifacts with `artifact.write`.
6. Include, when available, `phase-context`, `plan`, and `verification` artifacts.
7. End by telling the user the next step is `kata-execute-phase`.

## Planning Rules

1. Prefer one coherent vertical slice over broad horizontal setup.
2. Tasks must be executable and verifiable.
3. Keep backend state in the CLI; do not create local planning files as the source of truth.
