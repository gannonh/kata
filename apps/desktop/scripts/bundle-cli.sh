#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"

require_command() {
  local command_name="$1"
  local message="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: $message" >&2
    exit 1
  fi
}

require_command pnpm "pnpm is required to bundle the CLI runtime"

VENDOR_DIR="$DESKTOP_DIR/vendor"
KATA_RUNTIME_DIR="$VENDOR_DIR/kata-runtime"
KATA_LAUNCHER="$VENDOR_DIR/kata"
KATA_CMD_LAUNCHER="$VENDOR_DIR/kata.cmd"

log() {
  printf '[bundle-cli] %s\n' "$1"
}

log "preparing vendor directory"
rm -rf "$KATA_RUNTIME_DIR" "$KATA_LAUNCHER" "$KATA_CMD_LAUNCHER"
mkdir -p "$KATA_RUNTIME_DIR/src"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "installing monorepo dependencies"
  (cd "$ROOT_DIR" && pnpm install --frozen-lockfile)
fi

log "building local @kata-sh/cli runtime"
pnpm --dir "$ROOT_DIR/apps/cli" run build

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

log "writing launcher"
cat > "$KATA_LAUNCHER" <<'LAUNCHER'
#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
ELECTRON_BIN=""

if [ -x "$SCRIPT_DIR/../MacOS/Kata Desktop" ]; then
  ELECTRON_BIN="$SCRIPT_DIR/../MacOS/Kata Desktop"
else
  for candidate in \
    "$SCRIPT_DIR/../Kata Desktop" \
    "$SCRIPT_DIR/../kata-desktop" \
    "$SCRIPT_DIR/../kata"
  do
    if [ -x "$candidate" ]; then
      ELECTRON_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$ELECTRON_BIN" ]; then
  echo "ERROR: Unable to locate packaged Electron binary" >&2
  exit 1
fi

export ELECTRON_RUN_AS_NODE=1
exec "$ELECTRON_BIN" "$SCRIPT_DIR/kata-runtime/dist/loader.js" "$@"
LAUNCHER

cat > "$KATA_CMD_LAUNCHER" <<'WINDOWS_LAUNCHER'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "ELECTRON_RUN_AS_NODE=1"
"%SCRIPT_DIR%..\Kata Desktop.exe" "%SCRIPT_DIR%kata-runtime\dist\loader.js" %*
endlocal
WINDOWS_LAUNCHER

chmod +x "$KATA_LAUNCHER"

# Build and stage Symphony binary
SYMPHONY_DIR="$ROOT_DIR/apps/symphony"
SYMPHONY_BIN="$VENDOR_DIR/symphony"

if [[ -f "$SYMPHONY_DIR/Cargo.toml" ]]; then
  if command -v cargo >/dev/null 2>&1; then
    log "building Symphony (release)"
    (cd "$SYMPHONY_DIR" && cargo build --release)

    BUILT_BIN="$SYMPHONY_DIR/target/release/symphony"
    if [[ -f "$BUILT_BIN" ]]; then
      cp "$BUILT_BIN" "$SYMPHONY_BIN"
      chmod +x "$SYMPHONY_BIN"
      log "Symphony binary staged at $SYMPHONY_BIN"
    else
      log "WARNING: Symphony build succeeded but binary not found at $BUILT_BIN"
    fi
  else
    log "WARNING: cargo not found — skipping Symphony build"
  fi
else
  log "WARNING: apps/symphony/Cargo.toml not found — skipping Symphony build"
fi

log "bundle complete"
log "launcher: $KATA_LAUNCHER"
log "windows launcher: $KATA_CMD_LAUNCHER"
