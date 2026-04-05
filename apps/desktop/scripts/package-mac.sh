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
APP_VERSION="$(node -p "require('./package.json').version")"
ELECTRON_VERSION="$(node -p "const v=require('./package.json').devDependencies?.electron ?? ''; v.replace(/^[^0-9]*/, '').replace(/[^0-9.].*$/, '')")"

if [[ -z "$APP_VERSION" ]]; then
  echo "[package-mac] Failed to determine app version from apps/desktop/package.json" >&2
  exit 1
fi

if [[ -z "$ELECTRON_VERSION" ]]; then
  echo "[package-mac] Failed to determine Electron version from apps/desktop/package.json" >&2
  exit 1
fi

rm -rf "$APP_PARENT_DIR/Kata Desktop-darwin-arm64"
find "$APP_PARENT_DIR" -maxdepth 1 -name 'Kata Desktop-*.dmg' -delete 2>/dev/null || true

echo "[package-mac] Building Kata Desktop v$APP_VERSION (Electron $ELECTRON_VERSION)"

bunx electron-packager \
  .bundle-app \
  "Kata Desktop" \
  --platform=darwin \
  --arch=arm64 \
  --out=release \
  --overwrite \
  --icon="$DESKTOP_DIR/resources/AppIcon.icns" \
  --app-version="$APP_VERSION" \
  --electron-version="$ELECTRON_VERSION"

cp "$DESKTOP_DIR/vendor/kata" "$RESOURCES_DIR/kata"
cp -R "$DESKTOP_DIR/vendor/kata-runtime" "$RESOURCES_DIR/kata-runtime"
cp -R "$DESKTOP_DIR/vendor/bun" "$RESOURCES_DIR/bun"
chmod +x "$RESOURCES_DIR/kata" "$RESOURCES_DIR/bun/bun"

# Bundle Symphony binary if available
SYMPHONY_BIN="$DESKTOP_DIR/vendor/symphony"
if [[ -f "$SYMPHONY_BIN" ]]; then
  cp "$SYMPHONY_BIN" "$RESOURCES_DIR/symphony"
  chmod +x "$RESOURCES_DIR/symphony"
  echo "[package-mac] bundled Symphony binary"
else
  echo "[package-mac] WARNING: vendor/symphony not found — Symphony will not be bundled"
fi

bunx electron-builder --config electron-builder.yml --prepackaged "$APP_DIR" --mac dmg

echo "[package-mac] DMG ready in $APP_PARENT_DIR"
