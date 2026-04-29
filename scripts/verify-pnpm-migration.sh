#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DRIFT_TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/verify-pnpm-drift.XXXXXX")"
trap 'rm -f "$DRIFT_TMP_FILE"' EXIT

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

contains_bun_wrapper() {
  grep -Eq '\bbun[[:space:]]+run\b|\bbunx\b' "$1"
}

require_root_script() {
  local key="$1"
  node -e "const pkg=require('./package.json'); if(!pkg.scripts || !pkg.scripts['$key']) process.exit(1);" \
    || fail "missing root script: $key"
}

root_script_command() {
  local key="$1"
  node -e "const pkg=require('./package.json'); process.stdout.write(pkg.scripts['$key'] || '');"
}

phase "metadata"
require_file "package.json"
require_file "pnpm-workspace.yaml"
require_file "pnpm-lock.yaml"
command -v rg >/dev/null 2>&1 || fail "ripgrep (rg) is required to run this verifier"

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
  require_root_script "$key"
  cmd="$(root_script_command "$key")"
  if grep -Eq '\bbun[[:space:]]+run\b|\bbunx\b' <<<"$cmd"; then
    fail "root script '$key' still uses bun wrapper: $cmd"
  fi
done

phase "hook"
require_file ".githooks/pre-push"
if ! tr '\n' ' ' < .githooks/pre-push | grep -Eq 'pnpm[[:space:]]+exec[[:space:]]+turbo[[:space:]]+run[[:space:]]+lint[[:space:]]+typecheck[[:space:]]+test'; then
  fail "pre-push must invoke turbo via pnpm exec"
fi
for required_filter in '@kata/desktop' '@kata-sh/cli' '@kata/context'; do
  if ! grep -Fq -- "--filter=${required_filter}" .githooks/pre-push; then
    fail "pre-push missing required active-package filter: ${required_filter}"
  fi
done
if contains_bun_wrapper ".githooks/pre-push"; then
  fail "pre-push still references bun run/bunx"
fi

phase "app-scripts"
DESKTOP_FILES=(
  "apps/desktop/package.json"
  "apps/desktop/scripts/bundle-cli.sh"
  "apps/desktop/scripts/package-mac.sh"
)
for file in "${DESKTOP_FILES[@]}"; do
  require_file "$file"
  if contains_bun_wrapper "$file"; then
    fail "$file still references bun run/bunx"
  fi
done

UTILITY_FILES=(
  "apps/cli/package.json"
  "apps/context/package.json"
  "apps/online-docs/package.json"
)
for file in "${UTILITY_FILES[@]}"; do
  require_file "$file"
  if rg -n '\bnpx\b|\bnpm run\b' "$file" >"$DRIFT_TMP_FILE" 2>/dev/null; then
    fail "$file still references npx/npm run: $(head -n 1 "$DRIFT_TMP_FILE")"
  fi
done

phase "blockers"
printf '[verify-pnpm] Deferred blockers owned by S03/S04:\n'

printf '[verify-pnpm] S03 (bun:test migration) package-script blockers:\n'
S03_SCRIPT_BLOCKERS="$(
  rg -n '"test[^"\n]*"\s*:\s*"[^"\n]*(bun test|bun:test)[^"\n]*"' \
    package.json apps/*/package.json packages/*/package.json || true
)"
if [[ -n "$S03_SCRIPT_BLOCKERS" ]]; then
  printf '%s\n' "$S03_SCRIPT_BLOCKERS"
else
  printf '  (none detected)\n'
fi

S03_IMPORT_COUNT="$({ rg -n "from ['\"]bun:test['\"]" apps packages --glob '**/*.ts' || true; } | wc -l | tr -d ' ')"
printf '[verify-pnpm] S03 (bun:test imports in TS files): %s\n' "$S03_IMPORT_COUNT"

printf '[verify-pnpm] S04 (legacy root script blockers):\n'
S04_ROOT_BLOCKERS="$(rg -n '"(electron:|viewer:)' package.json || true)"
if [[ -n "$S04_ROOT_BLOCKERS" ]]; then
  printf '%s\n' "$S04_ROOT_BLOCKERS"
else
  printf '  (none detected)\n'
fi

if [[ -d apps/electron || -d apps/viewer ]]; then
  printf '[verify-pnpm] S04 (legacy app directories still present):'
  [[ -d apps/electron ]] && printf ' apps/electron'
  [[ -d apps/viewer ]] && printf ' apps/viewer'
  printf '\n'
else
  printf '[verify-pnpm] S04 (legacy app directories still present): none\n'
fi

printf '\n[verify-pnpm] OK: S02 migration checks passed (deferred blockers reported above).\n'
