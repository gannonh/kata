#!/usr/bin/env bash
set -euo pipefail

pnpm --dir apps/cli run build
pnpm --dir apps/orchestrator run build:skills
pnpm --dir apps/desktop run bundle:cli

test -f apps/cli/dist/loader.js
test -f apps/orchestrator/dist/skills/kata-setup/SKILL.md
test -e apps/desktop/vendor/pi
test -e apps/desktop/vendor/kata-cli
test -e apps/desktop/vendor/kata-skills
rg -n "name: kata-(setup|plan-phase|execute-phase|verify-work)" apps/orchestrator/dist/skills >/dev/null
rg -n "name: 'symphony'" apps/desktop/src/main/command-registry.ts >/dev/null
