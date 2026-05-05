#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$DESKTOP_DIR/.bundle-app"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cp -R "$DESKTOP_DIR/dist" "$STAGE_DIR/dist"

# Create empty node_modules so electron-builder's module collector
# stops here instead of crawling up to the monorepo root (which OOMs).
mkdir -p "$STAGE_DIR/node_modules"

SOURCE_PATH="$DESKTOP_DIR/package.json" OUTPUT_PATH="$STAGE_DIR/package.json" node --input-type=commonjs <<'NODE'
const fs = require('fs')
const sourcePath = process.env.SOURCE_PATH
const outputPath = process.env.OUTPUT_PATH

if (!sourcePath || !outputPath) {
  throw new Error('SOURCE_PATH and OUTPUT_PATH are required')
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

const stagedPackage = {
  name: source.name,
  productName: 'Kata Desktop',
  version: source.version,
  description: 'Kata Desktop packaged runtime',
  author: 'Kata Contributors',
  main: 'dist/main.cjs',
  type: 'commonjs'
}

fs.writeFileSync(outputPath, `${JSON.stringify(stagedPackage, null, 2)}\n`)
NODE

echo "[prepare-builder-app] staged app at $STAGE_DIR"
