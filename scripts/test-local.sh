#!/bin/bash
# Test Kata plugin locally
#
# Usage:
#   ./scripts/test-local.sh [directory]
#
# If directory is provided, changes to that directory first.
# Otherwise starts in current directory.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(dirname "$SCRIPT_DIR")/dist/plugin"

# Build first to ensure latest changes
echo "Building plugin..."
node "$SCRIPT_DIR/build.js"

if [ $? -ne 0 ]; then
  echo "Build failed!"
  exit 1
fi

# Change to target directory if provided
if [ -n "$1" ]; then
  cd "$1" || exit 1
  echo "Starting in: $(pwd)"
fi

# Launch Claude with local plugin
echo "Launching Claude Code with local plugin..."
claude --plugin-dir "$PLUGIN_DIR" --dangerously-skip-permissions
