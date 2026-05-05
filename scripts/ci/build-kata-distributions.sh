#!/usr/bin/env bash
set -euo pipefail

echo "[ci] Building golden-path distribution artifacts"
pnpm --dir apps/cli run build

echo "[ci] Validating artifact presence"
test -f apps/cli/dist/loader.js
test -f apps/cli/skills/kata-setup/SKILL.md
rg -n "name: kata-(setup|new-project|new-milestone|plan-phase|execute-phase|verify-work|complete-milestone|progress|health)" apps/cli/skills >/dev/null
test ! -e apps/cli/skills/kata-discuss-phase
test ! -e apps/cli/skills/kata-quick
test -f apps/cli/skills/kata-new-milestone/SKILL.md
test -f apps/cli/skills/kata-complete-milestone/SKILL.md
rg -n "references/alignment.md" apps/cli/skills/kata-plan-phase/SKILL.md >/dev/null

echo "[ci] Running golden-path behavior checks"
pnpm --dir apps/cli exec vitest run src/tests/phase-a-skill-surface.vitest.test.ts
pnpm --dir apps/cli exec vitest run src/tests/build-skill-bundle.vitest.test.ts
pnpm --dir apps/cli exec vitest run src/tests/setup-source.vitest.test.ts
pnpm --dir apps/cli exec vitest run src/tests/golden-path.pi-github.vitest.test.ts

echo "[ci] build-kata-distributions completed successfully"
