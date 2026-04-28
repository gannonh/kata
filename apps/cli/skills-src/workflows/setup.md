# Setup Workflow

Use this workflow to make Kata usable in the current harness before durable project work begins.

## Alignment

1. Confirm the user is running from the project repository.
2. Confirm whether they want Pi setup specifically or generic harness setup.
3. If the target harness is unclear, run generic setup first and then doctor.

## Runtime Flow

1. Run `npx @kata-sh/cli setup --pi` for Pi, or `npx @kata-sh/cli setup` for generic harness detection.
2. Run `npx @kata-sh/cli doctor`.
3. If doctor reports invalid GitHub configuration, ask the user to fix `.kata/preferences.md`.
4. If doctor reports missing GitHub auth, ask for `GITHUB_TOKEN` or `GH_TOKEN`.
5. Continue only after backend health is valid enough for the requested workflow.

## Rules

1. Do not create project, milestone, slice, task, or artifact state in setup.
2. Keep backend IO behind `@kata-sh/cli`.
3. Do not reference legacy local markdown state or legacy orchestrator commands.
