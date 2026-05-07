# Self Update

Use this flow when CLI operations, payload shapes, skills, or backends changed.

Run:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs update
```

The update command refreshes `references/generated-cli-contract.json` from local CLI source:

- `KATA_OPERATION_NAMES`
- `KataBackendKind`
- CLI package version
- git commit

Then inspect the diff.

## When Operations Changed

If new operations appear:

1. Add them to the runner's operation sequence.
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

1. Add temporary preferences generation.
2. Add provider proof checks.
3. Add cleanup support.
4. Add a backend-specific config section in `references/backend-config.md`.
5. Add an eval prompt covering the new backend.

## Minimum Verification

After updating:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs update
node <skill-directory>/scripts/kata-backend-uat.mjs --help
```

Then run the focused repo tests that cover changed CLI contracts.
