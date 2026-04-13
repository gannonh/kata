#!/usr/bin/env bash
set -euo pipefail

DEMO_CONFIG_DIR="${KATA_CONFIG_DIR:-$HOME/.kata-demo}"

echo "Resetting Kata Desktop demo environment at $DEMO_CONFIG_DIR"
bun run scripts/setup-demo.ts --reset
KATA_CONFIG_DIR="$DEMO_CONFIG_DIR" pnpm --dir apps/desktop run desktop:dev
