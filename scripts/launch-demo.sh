#!/bin/bash
# Launch Kata Agents with an isolated demo configuration.
# Sets up the demo environment and repo if they don't exist,
# then launches the app with KATA_CONFIG_DIR pointing to the demo directory.
#
# Your normal ~/.kata-agents/ is completely untouched.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEMO_CONFIG_DIR="$HOME/.kata-agents-demo"

echo "Kata Agents Demo"
echo "  Demo config: $DEMO_CONFIG_DIR"
echo "  Your config: ~/.kata-agents (untouched)"
echo ""

# Seed demo environment (no-op if already exists)
cd "$PROJECT_ROOT"
bun run scripts/setup-demo.ts
bash scripts/create-demo-repo.sh

echo ""
echo "Launching..."

# Check for --built flag to use packaged app
if [ "$1" = "--built" ]; then
  DEMO_APP_PATH="$PROJECT_ROOT/apps/electron/release/extracted-demo/Kata Agents.app"
  if [ ! -d "$DEMO_APP_PATH" ]; then
    echo "ERROR: Built app not found at $DEMO_APP_PATH"
    echo "Build first with: cd apps/electron && bun run dist:mac"
    exit 1
  fi
  KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" \
    "$DEMO_APP_PATH/Contents/MacOS/Kata Agents" &
else
  # Dev mode (default)
  KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" bun run electron:dev
fi
