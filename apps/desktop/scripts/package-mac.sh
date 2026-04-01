#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$DESKTOP_DIR"

bun run bundle:cli
bun run desktop:build
bun run prepare:builder-app

APP_PARENT_DIR="$DESKTOP_DIR/release"
APP_DIR="$APP_PARENT_DIR/Kata Desktop-darwin-arm64/Kata Desktop.app"
RESOURCES_DIR="$APP_DIR/Contents/Resources"

rm -rf "$APP_PARENT_DIR/Kata Desktop-darwin-arm64"

bunx electron-packager \
  .bundle-app \
  "Kata Desktop" \
  --platform=darwin \
  --arch=arm64 \
  --out=release \
  --overwrite \
  --app-version=0.0.0 \
  --electron-version=41.0.3

cp "$DESKTOP_DIR/vendor/kata" "$RESOURCES_DIR/kata"
cp -R "$DESKTOP_DIR/vendor/kata-runtime" "$RESOURCES_DIR/kata-runtime"
cp -R "$DESKTOP_DIR/vendor/bun" "$RESOURCES_DIR/bun"
chmod +x "$RESOURCES_DIR/kata" "$RESOURCES_DIR/bun/bun"

bunx electron-builder --config electron-builder.yml --prepackaged "$APP_DIR" --mac dmg

echo "[package-mac] DMG ready in $APP_PARENT_DIR"
