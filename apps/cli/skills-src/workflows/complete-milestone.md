# Complete Milestone Workflow

Use this workflow to complete the active milestone after verified work is accepted.

## Alignment Overlay

- `fast`: confirm the active milestone should close.
- `guided`: summarize delivered slices, verification evidence, and remaining risks.
- `deep`: include retrospective notes and next milestone candidates.

## Runtime Flow

1. Read active milestone with `milestone.getActive`.
2. Write milestone `summary` and `retrospective` artifacts with `artifact.write`.
3. Complete the milestone with `milestone.complete`.
4. End by telling the user the next step is `kata-new-milestone`.

## Completion Rules

1. Do not complete a milestone with unverified required tasks unless the user explicitly accepts the risk.
2. Preserve any follow-up work as artifact content or backend task state.
3. Keep the milestone lifecycle transition in the CLI backend contract.
