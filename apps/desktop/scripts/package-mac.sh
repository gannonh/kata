#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$DESKTOP_DIR"

bun run bundle:cli
bun run desktop:build

APP_VERSION="$(node -p "require('./package.json').version")"

if [[ -z "$APP_VERSION" ]]; then
  echo "[package-mac] Failed to determine app version from apps/desktop/package.json" >&2
  exit 1
fi

echo "[package-mac] Building Kata Desktop v$APP_VERSION"

# electron-builder handles everything: .app creation, code signing, DMG.
# afterPack.cjs copies vendor resources (kata, bun, symphony, Assets.car)
# into Contents/Resources after the app is built.
bunx electron-builder --config electron-builder.yml --mac dmg --arm64

echo "[package-mac] DMG ready in $DESKTOP_DIR/release"
