#!/usr/bin/env bash
set -euo pipefail

echo "[ci] Building golden-path distribution artifacts"
pnpm --dir apps/orchestrator run build:skills
pnpm --dir apps/cli run build
pnpm --dir apps/desktop run bundle:cli

echo "[ci] Validating artifact presence"
test -f apps/cli/dist/loader.js
test -f apps/orchestrator/dist/skills/kata-setup/SKILL.md
test -e apps/desktop/vendor/pi
test -e apps/desktop/vendor/kata-cli
test -e apps/desktop/vendor/kata-skills
rg -n "name: kata-(setup|new-project|discuss-phase|plan-phase|execute-phase|verify-work|quick|progress|health)" apps/orchestrator/dist/skills >/dev/null
rg -n "name: 'symphony'" apps/desktop/src/main/command-registry.ts >/dev/null

echo "[ci] Running golden-path behavior checks"
pnpm --dir apps/cli exec vitest run src/tests/setup-source.vitest.test.ts
pnpm --dir apps/cli exec vitest run src/tests/golden-path.pi-github.vitest.test.ts

echo "[ci] build-kata-distributions completed successfully"
