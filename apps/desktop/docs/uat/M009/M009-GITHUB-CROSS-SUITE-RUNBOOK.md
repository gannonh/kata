# M009/S06 Cross-Suite GitHub Acceptance Runbook

Run this from repo root (`/Volumes/EVO/symphony-workspaces/KAT-2708`).

## Goal

Prove assembled GitHub backend behavior across:

1. CLI GitHub planning/execution contracts
2. Desktop GitHub workflow backend contracts
3. Symphony GitHub execution contracts
4. CI GitHub backend lane
5. Real-environment runtime smoke + failure-path diagnostics

## Preconditions

- `pnpm install --frozen-lockfile` has completed
- `GH_TOKEN` or `GITHUB_TOKEN` is exported for the runtime smoke step (optional but recommended for S06 proof)
- Workspace is on the S06 branch with latest `origin/main` merged

## Single-command execution

```bash
bash scripts/uat/m009-cross-suite-github-acceptance.sh
```

## What the script executes

1. `bash scripts/ci/github-backend-validation.sh`
2. `pnpm --dir apps/cli exec bun test src/resources/extensions/kata/tests/github-backend.integration.test.ts --test-name-pattern "token is missing"`
3. `pnpm --dir apps/symphony exec cargo test --test github_execution_contract_tests test_projects_v2_unknown_status_reports_actionable_error -- --exact`
4. `KATA_GITHUB_SMOKE=1 GITHUB_TOKEN=<token> pnpm --dir apps/cli exec bun test ... --test-name-pattern "runtime smoke"` (skipped when token missing)
5. `pnpm --dir apps/desktop run build:main && pnpm --dir apps/desktop run build:preload && pnpm --dir apps/desktop run build:renderer && pnpm --dir apps/desktop exec playwright test e2e/tests/m009-github-cross-suite-proof.e2e.ts --output docs/uat/M009/evidence/playwright-results`

## Expected pass signals

- CI lane log ends with: `GitHub backend validation lane completed successfully.`
- Missing-token diagnostic test passes and emits `diagnostics:["missing_github_token"]`
- Symphony unknown-status diagnostic test passes
- Runtime smoke passes with `[kata][backend-bootstrap] {"backend":"github","status":"ready"...}`
- Desktop evidence capture test passes and writes screenshot at:
  - `apps/desktop/docs/uat/M009/evidence/screenshots/01-workflow-board-after-refresh.png`

## Artifacts written

All artifacts are written under:

`apps/desktop/docs/uat/M009/evidence/`

Primary files:

- `00-summary.txt`
- `01-ci-github-backend-validation.log`
- `02-cli-missing-token-diagnostic.log`
- `03-symphony-unknown-status-diagnostic.log`
- `04-cli-runtime-smoke.log`
- `05-desktop-github-e2e.log`
- `screenshots/01-workflow-board-after-refresh.png`
