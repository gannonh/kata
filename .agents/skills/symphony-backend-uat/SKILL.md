---
name: symphony-backend-uat
description: Use this skill when the user wants to prove, test, UAT, validate, or clean up Symphony helper backend integrations against real GitHub Projects v2 or Linear instances. Use it for direct helper operation proof runs, backend health checks, generated proof links, helper contract updates, and cleanup of prior Symphony backend UAT runs.
---

# Symphony Backend UAT

## Operating Brief

Use this skill to prove that the Symphony direct helper contract works end to end against a real backend.

Ask which action to run unless the user already specified it:

1. Test a backend
2. Update this skill from Symphony changes
3. Clean up a prior test run

The bundled script builds or locates the Symphony binary, writes isolated workflow fixtures, runs health checks, calls every helper operation supported by the selected backend, captures provider proof links, and records cleanup state.

## Required Reading

Read before acting:

- `references/workflow.md`
- `references/backend-config.md`
- `references/evidence.md`

Read `references/self-update.md` when updating the skill from Symphony source or prompt changes.

## Script

```bash
node <skill-directory>/scripts/symphony-backend-uat.mjs --help
```

Common commands:

```bash
node <skill-directory>/scripts/symphony-backend-uat.mjs test --backend github
node <skill-directory>/scripts/symphony-backend-uat.mjs test --backend linear
node <skill-directory>/scripts/symphony-backend-uat.mjs update
node <skill-directory>/scripts/symphony-backend-uat.mjs cleanup --evidence /path/to/evidence.json
```

## Result Format

Report:

- Backend tested.
- Health result.
- Helper operation coverage.
- Created issue, child issue, comments, documents, and follow-up issue.
- GitHub PR helper results or skip reason.
- Provider proof links.
- Evidence file path and report file path.
- Cleanup result or cleanup command.

Keep the final answer concise and factual.

## Rules

- Use real backends only when the user requested integration proof or UAT.
- Use an isolated temporary run directory for every test.
- Do not claim success until health checks, helper coverage, provider reads, proof links, and evidence files are recorded.
- Treat missing shared helper operation coverage as a failed proof.
- Record GitHub PR helper skips with a concrete reason when no PR is discoverable.
- If the test creates backend state and fails, run cleanup with the evidence file when the user asks.
