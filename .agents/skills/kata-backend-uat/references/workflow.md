# Workflow

## Choose Action

If the user did not specify an action, ask:

1. Test a backend
2. Update this skill from CLI changes
3. Clean up a prior test run

## Test A Backend

1. Identify the backend: `github` or `linear`.
2. Read `references/backend-config.md`.
3. Build the local CLI if source files changed or `apps/cli/dist/loader.js` is stale.
4. Run:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs test --backend <backend>
```

5. If the script fails after creating backend records, preserve the evidence/run directory and offer cleanup.
6. Read the generated `evidence.json` and `evidence.md`.
7. Summarize the result using `references/evidence.md`.

## Update This Skill From CLI Changes

1. Read `references/self-update.md`.
2. Run:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs update
```

3. Review generated contract changes.
4. If new operations or backend kinds are detected, update the runner sequence and payload generation.
5. Run syntax checks and relevant focused tests.

## Clean Up A Prior Test Run

1. Ask for the evidence file path if it was not provided.
2. Run:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs cleanup --evidence /path/to/evidence.json
```

3. Report which records were completed or skipped.

## Completion Gate

Before reporting success:

- `health.check` was run.
- Every operation in the current CLI operation list was observed, or missing operations are reported as failure.
- Generated artifacts have proof links.
- GitHub comments or Linear comments/documents were fetched back from the provider.
- The final milestone was completed or cleanup instructions are provided.
