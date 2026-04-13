#!/usr/bin/env bash
set -euo pipefail

DEMO_CONFIG_DIR="${KATA_CONFIG_DIR:-$HOME/.kata-demo-onboarding}"

rm -rf "$DEMO_CONFIG_DIR"

echo "Launching Kata Desktop with a fresh demo config to trigger onboarding..."
echo "  config: $DEMO_CONFIG_DIR"

KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" pnpm --dir apps/desktop run desktop:dev
