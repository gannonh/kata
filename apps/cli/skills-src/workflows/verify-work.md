# Verify Work Workflow

Use this workflow to verify completed work and record UAT or verification artifacts.

## Alignment Overlay

- `fast`: run the known verification command and summarize the result.
- `guided`: run tests, inspect relevant app behavior, and record pass or fail evidence.
- `deep`: perform exploratory UAT and capture gaps as follow-up tasks.

## Runtime Flow

1. Read project context with `project.getContext`.
2. List tasks with `task.list`.
3. Read verification artifacts with `artifact.read`.
4. Run verification or UAT.
5. Write a `uat` or `verification` artifact with `artifact.write`.
6. Update task verification state with `task.updateStatus`.
7. If the milestone is complete, route to `kata-complete-milestone`.

## Verification Rules

1. Evidence comes before claims.
2. Record failures as durable artifacts when they affect the milestone.
3. Do not close a milestone from this workflow; route to `kata-complete-milestone`.
