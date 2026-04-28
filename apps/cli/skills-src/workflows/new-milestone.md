# New Milestone Workflow

Use this workflow to create the next Kata milestone for an existing project.

## Alignment Overlay

- `fast`: ask for milestone title and goal.
- `guided`: ask for title, goal, success criteria, likely slices, and constraints.
- `deep`: additionally inspect project artifacts and discuss sequencing tradeoffs.

## Runtime Flow

1. Read project context with `project.getContext`.
2. Create the milestone with `milestone.create`.
3. Write milestone artifacts with `artifact.write`.
4. Include, when available, `requirements` and `roadmap` artifacts.
5. Present the next step: run `kata-plan-phase`.

## Rules

1. Create exactly one active milestone unless the user explicitly asks to create multiple.
2. Keep discussion integrated in this workflow; do not route to a standalone discussion skill.
3. Persist durable decisions through the CLI artifact contract.
