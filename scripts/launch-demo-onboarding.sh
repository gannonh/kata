#!/bin/bash
# Launch demo with onboarding screen (temporarily hides workspaces)

WORKSPACES_DIR="$HOME/.kata-agents/workspaces"
BACKUP_DIR="$HOME/.kata-agents/workspaces-backup-demo"
DEMO_PROFILE="/Users/gannonhall/.kata-agents-demo-onboarding"

echo "🔹 Temporarily moving workspaces to trigger onboarding..."
if [ -d "$WORKSPACES_DIR" ]; then
  mv "$WORKSPACES_DIR" "$BACKUP_DIR"
  echo "✓ Workspaces backed up to: $BACKUP_DIR"
fi

echo "🔹 Launching demo app with onboarding..."
open "/Users/gannonhall/dev/kata/kata-agents/apps/electron/release/extracted-demo/Kata Agents.app" \
  --new \
  --args --user-data-dir="$DEMO_PROFILE"

echo ""
echo "📋 When done with demo, restore your workspaces with:"
echo "   mv \"$BACKUP_DIR\" \"$WORKSPACES_DIR\""
echo ""
echo "Or run: ./scripts/restore-workspaces.sh"
