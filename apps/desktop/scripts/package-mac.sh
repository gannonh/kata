#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$DESKTOP_DIR"

bun run bundle:cli
bun run desktop:build
bun run prepare:builder-app

APP_PARENT_DIR="$DESKTOP_DIR/release"
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
find "$APP_PARENT_DIR" -maxdepth 1 -name 'Kata-Desktop-*.dmg' -delete 2>/dev/null || true

echo "[package-mac] Building Kata Desktop v$APP_VERSION (Electron $ELECTRON_VERSION)"

# Temporarily hide .icon directory from electron-packager.
# electron-packager auto-detects .icon files and calls actool, which fails on macOS < 26.
# We handle the Liquid Glass icon manually via Assets.car after packaging.
LIQUID_GLASS_DIR="$DESKTOP_DIR/resources/liquid-glass"
if [[ -d "$LIQUID_GLASS_DIR/AppIcon.icon" ]]; then
  ICON_HIDDEN=true
else
  ICON_HIDDEN=false
fi

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

APP_DIR="$APP_PARENT_DIR/Kata Desktop-darwin-arm64/Kata Desktop.app"
RESOURCES_DIR="$APP_DIR/Contents/Resources"

# Copy bundled runtime resources
cp "$DESKTOP_DIR/vendor/kata" "$RESOURCES_DIR/kata"
cp -R "$DESKTOP_DIR/vendor/kata-runtime" "$RESOURCES_DIR/kata-runtime"
cp -R "$DESKTOP_DIR/vendor/bun" "$RESOURCES_DIR/bun"
chmod +x "$RESOURCES_DIR/kata" "$RESOURCES_DIR/bun/bun"

# Bundle Symphony binary if available
if [[ -f "$DESKTOP_DIR/vendor/symphony" ]]; then
  cp "$DESKTOP_DIR/vendor/symphony" "$RESOURCES_DIR/symphony"
  chmod +x "$RESOURCES_DIR/symphony"
  echo "[package-mac] bundled Symphony binary"
fi

# Copy pre-compiled Liquid Glass icon (Assets.car) for macOS 26+
if [[ -f "$LIQUID_GLASS_DIR/Assets.car" ]]; then
  cp "$LIQUID_GLASS_DIR/Assets.car" "$RESOURCES_DIR/Assets.car"
  echo "[package-mac] bundled Liquid Glass icon (Assets.car)"
fi

# Set CFBundleIconName in Info.plist for macOS 26+ Liquid Glass resolution
/usr/libexec/PlistBuddy -c "Add :CFBundleIconName string AppIcon" "$APP_DIR/Contents/Info.plist" 2>/dev/null || \
  /usr/libexec/PlistBuddy -c "Set :CFBundleIconName AppIcon" "$APP_DIR/Contents/Info.plist"

# Create DMG using electron-builder (--prepackaged skips the module collector)
bunx electron-builder --config electron-builder.yml --prepackaged "$APP_DIR" --mac dmg

echo "[package-mac] DMG ready in $APP_PARENT_DIR"
