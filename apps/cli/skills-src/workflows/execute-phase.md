# Execute Phase Workflow

Use this workflow to execute planned slice tasks through the active Kata backend state.

## Alignment Overlay

- `fast`: execute the next todo task.
- `guided`: confirm task order and verification command before editing code.
- `deep`: inspect risks and dependencies before executing.

## Runtime Flow

1. Read active milestone with `milestone.getActive`.
2. List slices with `slice.list`.
3. List tasks with `task.list`.
4. For each selected task, mark it `in_progress` with `task.updateStatus`.
5. Perform the code work in the repository.
6. Run verification commands.
7. Mark completed tasks `done`, or leave them `in_progress` with failure evidence.
8. Write execution artifacts with `artifact.write`.
9. Include, when available, `summary` and `verification` artifacts.
10. End by telling the user the next step is `kata-verify-work`.

## Execution Rules

1. Do not bypass the CLI when reading or mutating Kata artifacts.
2. Do not claim completion without verification evidence.
3. If execution needs autonomous dispatch, hand off to Symphony in later phases rather than inventing a local task runner here.
