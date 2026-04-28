# Progress Workflow

Use this workflow to summarize current Kata project, milestone, slice, task, and execution state.

## Runtime Flow

1. Read project context with `project.getContext`.
2. Read active milestone with `milestone.getActive`.
3. List slices with `slice.list`.
4. List tasks for each slice with `task.list`.
5. Read artifact inventory with `artifact.list`.
6. Read execution status with `execution.getStatus`.
7. Summarize current state and recommend the next primary workflow.

## Rules

1. Treat backend state as authoritative.
2. Be explicit about missing project, milestone, slice, or task state.
3. Recommend one next action, not a menu of unrelated options.
