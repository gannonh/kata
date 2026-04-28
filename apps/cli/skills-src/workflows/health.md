# Health Workflow

Use this workflow when the user asks whether Kata is configured, connected, or ready.

## Required Reading

- `references/cli-runtime.md`

## Flow

1. Run CLI doctor when available from the project root:

```bash
node apps/cli/dist/loader.js doctor
```

2. Run runtime health through the installed skill helper:

```bash
node ./scripts/kata-call.mjs health.check
```

3. Read project context:

```bash
node ./scripts/kata-call.mjs project.getContext
```

4. Report the result in plain language:

- Backend: GitHub or Linear.
- Repository/project identity.
- Blocking errors.
- Warnings that do not block work.
- Exact next fix if blocked.

## Rules

- Do not inspect helper scripts unless the command itself fails.
- Do not start setup automatically unless health proves setup is missing.
- Do not proceed into planning or execution when `health.check` returns `ok: false`.

