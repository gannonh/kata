# Workflow Reference

# Setup Workflow

Use this workflow to make Kata usable in the current harness before durable project work begins.

## Required Reading

- `references/cli-runtime.md`
- `references/artifact-contract.md`

## Flow

1. Confirm the user is running from the project repository.
2. Run setup through the installed skill helper:

```bash
node ./scripts/kata-call.mjs setup --pi
```

3. Verify CLI setup:

```bash
node ./scripts/kata-call.mjs doctor
```

4. Verify runtime health from an installed skill:

```bash
node ./scripts/kata-call.mjs health.check
```

## Rules

- Do not create project, milestone, slice, task, or artifact state during setup.
- If `doctor` reports invalid backend configuration, ask the user to fix `.kata/preferences.md`.
- If `doctor` reports missing GitHub auth, ask the user to set `GITHUB_TOKEN` or `GH_TOKEN`.
- Continue to product workflows only after setup and backend health are good enough for the requested action.
