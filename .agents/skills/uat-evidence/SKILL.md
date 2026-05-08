---
name: uat-evidence
description: Use this skill when the user wants to prove, test, UAT, validate, capture evidence for, or clean up backend integrations for either Kata CLI or the Symphony runtime against real GitHub Projects v2 or Linear instances. Use it for Kata CLI operation coverage, Symphony helper operation coverage, backend health checks, provider proof links, evidence bundles, cleanup of prior UAT runs, and keeping the UAT harness current when CLI or Symphony runtime contracts change.
---

# UAT Evidence

## Operating Brief

Use this skill to run backend UAT proof against a real provider and produce durable evidence under the repo-local `uat-evidence/` folder.

Ask which runtime, backend, and action to run unless the user already specified them:

- Runtime: `kata-cli` or `symphony-runtime`
- Backend: `github` or `linear`
- Action: `test`, `update`, or `cleanup`

The bundled dispatcher routes to the runtime-specific runner:

```bash
node <skill-directory>/scripts/uat-evidence.mjs --help
```

Common commands:

```bash
node <skill-directory>/scripts/uat-evidence.mjs test --runtime kata-cli --backend github
node <skill-directory>/scripts/uat-evidence.mjs test --runtime kata-cli --backend linear
node <skill-directory>/scripts/uat-evidence.mjs test --runtime symphony-runtime --backend github
node <skill-directory>/scripts/uat-evidence.mjs test --runtime symphony-runtime --backend linear
node <skill-directory>/scripts/uat-evidence.mjs update --runtime kata-cli
node <skill-directory>/scripts/uat-evidence.mjs update --runtime symphony-runtime
node <skill-directory>/scripts/uat-evidence.mjs cleanup --evidence /path/to/evidence.json
```

Run from the project workspace root. Default run output is:

```text
<workspace>/uat-evidence/<runtime>-<backend>-<timestamp>-<pid>/
```

`uat-evidence/` is a generated evidence directory and should stay ignored by git.

## Required Reading

Read before acting:

- `references/workflow.md`
- `references/backend-config.md`
- `references/evidence.md`

Read `references/self-update.md` when updating the skill after Kata CLI or Symphony runtime contract changes.

## Runtime Notes

### Kata CLI

Use `--runtime kata-cli` for Kata CLI backend contract proof. In a local checkout, build the CLI first when source files changed:

```bash
pnpm --filter @kata-sh/cli run build
```

The runner covers Kata CLI operations including health, project, milestone, slice, task, issue, artifact, and execution status operations.

### Symphony runtime

Use `--runtime symphony-runtime` for direct Symphony helper proof. The runner builds or locates the Symphony binary, writes an isolated workflow fixture, runs `symphony doctor`, calls helper operations, records provider proof links, and writes cleanup state.

## Result Format

Report:

- Runtime tested.
- Backend tested.
- Health result.
- Operation coverage, including expected, observed, skipped, and missing operations when available.
- Created backend state: milestones, slices, tasks, issues, comments, documents, child issues, follow-up issues, or PR helper results.
- Provider proof links.
- Evidence JSON path and report path.
- Cleanup result or cleanup command.
- Any warnings, retries, skips, or unsupported operations.

Keep the final answer concise and factual.

## Rules

- Use real backends only when the user asked for integration proof or UAT.
- Use the bundled runner for the requested runtime instead of hand-writing operation payloads.
- Let the default output path write under `<workspace>/uat-evidence/` unless the user explicitly requests another location.
- Do not write evidence into the skill directory or a `*-workspace` directory.
- Do not claim success until health checks, operation coverage, provider reads, proof links, and evidence files are recorded.
- Treat missing shared operation coverage as a failed proof.
- Record runtime-specific skips with concrete reasons, such as unavailable GitHub PR context for Symphony PR helpers.
- If a test creates backend state and fails, preserve the evidence file and run cleanup when requested.
