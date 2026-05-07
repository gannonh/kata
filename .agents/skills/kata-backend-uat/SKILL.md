---
name: kata-backend-uat
description: Use this skill when the user wants to prove, test, UAT, validate, or clean up Kata CLI backend integrations against real GitHub Projects v2 or Linear instances. Use it for end-to-end backend proof runs, every-operation skill runtime checks, backend health checks, artifact proof links, integration evidence, cleanup of prior UAT runs, and keeping this UAT harness current when CLI operations or backends change.
---

# Kata Backend UAT

## Operating Brief

Use this skill to prove that Kata CLI backend operations work end to end against a real backend.

Start by asking which action to run unless the user already specified it:

1. Test a backend
2. Update this skill from CLI changes
3. Clean up a prior test run

The bundled script handles deterministic execution, evidence capture, retryable provider failures, artifact proof checks, and cleanup. The agent should choose the right mode, run the script from the workspace, then summarize the evidence.

## Required Reading

Read these references before acting:

- `references/workflow.md`
- `references/backend-config.md`
- `references/evidence.md`

Read `references/self-update.md` when updating the skill from CLI changes.

## Script

Use the bundled runner:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs --help
```

Common commands:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs test --backend github
node <skill-directory>/scripts/kata-backend-uat.mjs test --backend linear
node <skill-directory>/scripts/kata-backend-uat.mjs update
node <skill-directory>/scripts/kata-backend-uat.mjs cleanup --evidence /path/to/evidence.json
```

Run from the project workspace. In a local Kata CLI checkout, build the CLI first when source files changed:

```bash
pnpm --filter @kata-sh/cli run build
```

## Result Format

Report:

- Backend tested.
- Health result.
- Operation coverage, including expected, observed, and missing operations.
- Created milestone, slices, tasks, and issue.
- Artifact proof links from the evidence manifest.
- Evidence file path and report file path.
- Cleanup result or cleanup command.
- Any warnings, retries, or unsupported operations.

Keep the final answer concise and factual.

## Rules

- Use real backends only when the user asked for an integration proof or UAT.
- Use an isolated temporary workspace for each run.
- Do not hand-write operation payloads when the bundled runner supports the requested backend.
- Do not ignore missing operation coverage. Treat it as a failed proof.
- Do not claim success until `health.check`, operation coverage, artifact proof checks, and final validation are recorded in evidence.
- If a provider returns a retryable network failure, rerun through the script so retries are captured.
- If a test run fails after creating backend state, offer cleanup with the evidence file or run directory.
