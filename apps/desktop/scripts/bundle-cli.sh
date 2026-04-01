#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"

VENDOR_DIR="$DESKTOP_DIR/vendor"
KATA_RUNTIME_DIR="$VENDOR_DIR/kata-runtime"
BUN_DIR="$VENDOR_DIR/bun"
KATA_LAUNCHER="$VENDOR_DIR/kata"

log() {
  printf '[bundle-cli] %s\n' "$1"
}

log "preparing vendor directory"
rm -rf "$KATA_RUNTIME_DIR" "$BUN_DIR" "$KATA_LAUNCHER"
mkdir -p "$KATA_RUNTIME_DIR/src" "$BUN_DIR"

if ! command -v bun >/dev/null 2>&1; then
  echo "ERROR: bun is required to bundle the kata CLI." >&2
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "installing monorepo dependencies"
  (cd "$ROOT_DIR" && bun install)
fi

log "building local @kata-sh/cli runtime"
(cd "$ROOT_DIR/apps/cli" && bun run build)

if [ ! -f "$ROOT_DIR/apps/cli/dist/loader.js" ]; then
  echo "ERROR: expected apps/cli/dist/loader.js after build" >&2
  exit 1
fi

log "copying kata runtime files"
cp -R "$ROOT_DIR/apps/cli/dist" "$KATA_RUNTIME_DIR/dist"
cp -R "$ROOT_DIR/apps/cli/pkg" "$KATA_RUNTIME_DIR/pkg"
cp -R "$ROOT_DIR/apps/cli/src/resources" "$KATA_RUNTIME_DIR/src/resources"
cp "$ROOT_DIR/apps/cli/package.json" "$KATA_RUNTIME_DIR/package.json"

log "installing production dependencies for bundled runtime"
(
  cd "$KATA_RUNTIME_DIR"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
)

BUN_BIN="$(command -v bun)"
log "copying bun runtime from $BUN_BIN"
cp "$BUN_BIN" "$BUN_DIR/bun"
chmod +x "$BUN_DIR/bun"

log "writing launcher"
cat > "$KATA_LAUNCHER" <<'EOF'
#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/bun/bun" "$SCRIPT_DIR/kata-runtime/dist/loader.js" "$@"
EOF

chmod +x "$KATA_LAUNCHER"

log "bundle complete"
log "launcher: $KATA_LAUNCHER"
