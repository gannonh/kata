# Workflow

## Choose Action

If the user did not specify action, runtime, or backend, ask for the missing pieces:

1. Action: test a backend, update generated contracts, or clean up a prior test run.
2. Runtime: `kata-cli` or `symphony-runtime`.
3. Backend for tests: `github` or `linear`.

## Test A Backend

1. Identify the runtime and backend.
2. Read `references/backend-config.md`.
3. Prepare the runtime:
   - Kata CLI: build `@kata-sh/cli` if source files changed or `apps/cli/dist/loader.js` is stale.
   - Symphony runtime: let the runner build or locate the local Symphony binary, or pass `--binary` if needed.
4. Run:

```bash
node <skill-directory>/scripts/uat-evidence.mjs test --runtime <kata-cli|symphony-runtime> --backend <github|linear>
```

5. Preserve the generated run directory under `uat-evidence/`.
6. If the script fails after creating backend state, report the evidence path and cleanup command.
7. Read generated `evidence.json` and `evidence.md`.
8. Summarize using `references/evidence.md`.

## Update Contracts

1. Read `references/self-update.md`.
2. Run:

```bash
node <skill-directory>/scripts/uat-evidence.mjs update --runtime <kata-cli|symphony-runtime>
```

3. Review generated contract changes.
4. If operations or backend kinds changed, update the matching runtime runner sequence, payloads, proof checks, and cleanup support.
5. Run syntax checks and focused tests.

## Clean Up A Prior Test Run

1. Ask for the evidence file path if it was not provided.
2. Run:

```bash
node <skill-directory>/scripts/uat-evidence.mjs cleanup --evidence /path/to/evidence.json
```

The dispatcher infers the runtime from evidence when possible. Pass `--runtime` if inference fails.

3. Report which provider records were completed, closed, or skipped.

## Completion Gate

Before reporting success:

- Health checks ran and passed.
- Expected runtime operations are observed or explicitly skipped with a recorded reason.
- Missing operations are reported as failure.
- Provider proof links are present.
- Evidence JSON and report files exist under `uat-evidence/` unless the user requested another output directory.
- Cleanup command is provided when backend state remains open.
