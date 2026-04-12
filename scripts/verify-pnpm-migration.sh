#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

phase() {
  printf '\n[verify-pnpm] phase: %s\n' "$1"
}

fail() {
  printf '[verify-pnpm] FAIL: %s\n' "$1" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "required file missing: $path"
}

require_script() {
  local key="$1"
  node -e "const pkg=require('./package.json'); if(!pkg.scripts || !pkg.scripts['$key']) process.exit(1);" \
    || fail "missing root script: $key"
}

script_command() {
  local key="$1"
  node -e "const pkg=require('./package.json'); process.stdout.write(pkg.scripts['$key'] || '');"
}

phase "metadata"
require_file "package.json"
require_file "pnpm-workspace.yaml"
require_file "pnpm-lock.yaml"

PACKAGE_MANAGER="$(node -e "const pkg=require('./package.json'); process.stdout.write(pkg.packageManager || '')")"
[[ "$PACKAGE_MANAGER" == pnpm@* ]] || fail "packageManager must be pinned to pnpm@... (got '$PACKAGE_MANAGER')"

[[ ! -f bun.lock ]] || fail "bun.lock must be removed"

phase "root-scripts"
ACTIVE_ROOT_SCRIPTS=(
  "lint"
  "typecheck"
  "test"
  "validate"
  "validate:affected"
  "desktop:dev"
  "desktop:build"
  "desktop:dist:mac"
  "docs:dev"
  "print:system-prompt"
  "verify:pnpm"
)

for key in "${ACTIVE_ROOT_SCRIPTS[@]}"; do
  require_script "$key"
  cmd="$(script_command "$key")"
  if grep -Eq '\bbun(run|x)\b' <<<"$cmd"; then
    fail "root script '$key' still uses bun wrapper: $cmd"
  fi
done

phase "hook"
require_file ".githooks/pre-push"
if ! grep -Fq 'pnpm exec turbo run lint typecheck test --affected' .githooks/pre-push; then
  fail "pre-push must invoke turbo via pnpm exec"
fi
if grep -Eq '\bbun(run|x)\b' .githooks/pre-push; then
  fail "pre-push still references bun run/bunx"
fi

phase "blockers"
printf '[verify-pnpm] Deferred blockers owned by S03/S04:\n'

S03_BLOCKERS="$(rg -n '\bbun test\b|bun:test' apps packages package.json || true)"
if [[ -n "$S03_BLOCKERS" ]]; then
  printf '%s\n' "$S03_BLOCKERS"
else
  printf '  (none detected)\n'
fi

S04_BLOCKERS="$(rg -n '"(electron:|viewer:|test:e2e(:|"))' package.json || true)"
if [[ -n "$S04_BLOCKERS" ]]; then
  printf '%s\n' "$S04_BLOCKERS"
else
  printf '  (none detected)\n'
fi

printf '\n[verify-pnpm] OK: S02 root migration checks passed.\n'
