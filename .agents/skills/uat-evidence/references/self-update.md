# Self Update

Use this flow when Kata CLI operations, Symphony helper operations, payload shapes, prompt files, or backends change.

## Kata CLI Contract

Run:

```bash
node <skill-directory>/scripts/uat-evidence.mjs update --runtime kata-cli
```

This refreshes `references/generated-cli-contract.json` from local CLI source:

- `KATA_OPERATION_NAMES`
- `KataBackendKind`
- CLI package version
- git commit

## Symphony Runtime Contract

Run:

```bash
node <skill-directory>/scripts/uat-evidence.mjs update --runtime symphony-runtime
```

This refreshes `references/generated-symphony-contract.json` from local Symphony source and prompt files.

## When Operations Changed

If new operations appear:

1. Add them to the matching runtime runner sequence.
2. Add payload generation if the operation requires input.
3. Add proof checks if the operation creates durable backend state.
4. Add cleanup support if the operation can leave durable test state.
5. Run update again and confirm the generated contract matches the runner.

If operations were removed:

1. Remove them from the runner sequence.
2. Remove obsolete payload generation and proof checks.
3. Keep cleanup for old evidence files when practical.

## When Backends Changed

If a new backend kind appears:

1. Add temporary runtime config generation.
2. Add provider proof checks.
3. Add cleanup support.
4. Add a backend-specific config section in `references/backend-config.md`.
5. Add an eval prompt covering the new backend.

## Minimum Verification

After updating:

```bash
node <skill-directory>/scripts/uat-evidence.mjs update --runtime kata-cli
node <skill-directory>/scripts/uat-evidence.mjs update --runtime symphony-runtime
node <skill-directory>/scripts/uat-evidence.mjs --help
node <skill-directory>/scripts/uat-evidence.mjs test --runtime kata-cli --backend github --dry-run
node <skill-directory>/scripts/uat-evidence.mjs test --runtime symphony-runtime --backend github --dry-run
```

Then run focused repo tests that cover changed contracts.
