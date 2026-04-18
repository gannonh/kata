# Backend Abstraction Eval Runbook

## 1. Run prompt/skill leakage tests

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-desktop/apps/symphony
cargo test --test workflow_config_tests --test backend_neutral_worker_contract_tests
```

## 2. Run CLI kata tool contract tests

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-desktop/apps/cli
pnpm exec vitest run src/resources/extensions/kata/tests/kata-tools.vitest.test.ts src/resources/extensions/kata/tests/linear-backend.vitest.test.ts src/resources/extensions/kata/tests/github-backend.artifacts.vitest.test.ts
```

## 3. Run GitHub backend validation lane

```bash
cd /Volumes/EVO/kata/kata-mono.worktrees/wt-desktop
bash scripts/ci/github-backend-validation.sh
```

## 4. Run `skill-creator` qualitative loop

Use `/Users/gannonhall/.agents/skills/skill-creator/SKILL.md` with `apps/symphony/evals/backend-abstraction/evals.json` as the eval prompt source.
Capture baseline vs updated outputs and summarize deltas in the spec evidence section.
