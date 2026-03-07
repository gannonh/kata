#!/bin/bash
# Restore workspaces after demo

WORKSPACES_DIR="$HOME/.kata-agents/workspaces"
BACKUP_DIR="$HOME/.kata-agents/workspaces-backup-demo"

if [ -d "$BACKUP_DIR" ]; then
  echo "🔹 Restoring workspaces..."
  mv "$BACKUP_DIR" "$WORKSPACES_DIR"
  echo "✓ Workspaces restored!"
else
  echo "❌ No backup found at: $BACKUP_DIR"
  exit 1
fi
