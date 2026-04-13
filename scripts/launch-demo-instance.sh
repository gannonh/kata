#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_PROFILE="${DEMO_PROFILE:-$HOME/.kata-demo-instance}"
DEV_SERVER_URL="${VITE_DEV_SERVER_URL:-http://127.0.0.1:5174}"

cat <<EOF
Launching a dedicated Kata Desktop demo instance.
- user-data-dir: $DEMO_PROFILE
- renderer URL:   $DEV_SERVER_URL

Expected prep:
  1. pnpm --dir apps/desktop run dev:renderer
  2. pnpm --dir apps/desktop run build:main
  3. pnpm --dir apps/desktop run build:preload
EOF

VITE_DEV_SERVER_URL="$DEV_SERVER_URL" pnpm exec electron "$PROJECT_ROOT/apps/desktop" \
  --user-data-dir="$DEMO_PROFILE" \
  --enable-logging
