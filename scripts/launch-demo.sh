#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_CONFIG_DIR="${KATA_CONFIG_DIR:-$HOME/.kata-demo}"

echo "Kata Desktop Demo"
echo "  Demo config: $DEMO_CONFIG_DIR"
echo "  Source repo:  $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"
bun run scripts/setup-demo.ts
bash scripts/create-demo-repo.sh

echo ""
echo "Launching..."

if [[ "${1:-}" == "--built" ]]; then
  DEMO_APP_PATH="$(find "$PROJECT_ROOT/apps/desktop-legacy/release" -maxdepth 2 -name 'Kata Desktop.app' -print -quit 2>/dev/null || true)"
  if [[ -z "$DEMO_APP_PATH" || ! -d "$DEMO_APP_PATH" ]]; then
    echo "ERROR: Built app not found under apps/desktop-legacy/release"
    echo "Build first with: pnpm --dir apps/desktop-legacy run desktop:dist:mac"
    exit 1
  fi

  KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" \
    open "$DEMO_APP_PATH" --new --args --user-data-dir="$HOME/.kata-demo-profile"
else
  KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" pnpm --dir apps/desktop-legacy run desktop:dev
fi
