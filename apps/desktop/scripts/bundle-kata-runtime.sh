#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
VENDOR_DIR="$DESKTOP_DIR/vendor"
PI_RUNTIME_VERSION="${KATA_PI_RUNTIME_VERSION:-0.70.2}"

require_command() {
  local command_name="$1"
  local message="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: $message" >&2
    exit 1
  fi
}

log() {
  printf '[bundle-kata-runtime] %s\n' "$1"
}

require_command pnpm "pnpm is required to bundle the Kata runtime"

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/kata-cli" "$VENDOR_DIR/kata-skills" "$VENDOR_DIR/pi-runtime"

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  log "installing monorepo dependencies"
  (cd "$ROOT_DIR" && pnpm install --frozen-lockfile)
fi

log "building Kata CLI"
pnpm --dir "$ROOT_DIR/apps/cli" run build

log "copying Kata CLI bundle"
cp -R "$ROOT_DIR/apps/cli/dist" "$VENDOR_DIR/kata-cli/dist"
cp "$ROOT_DIR/apps/cli/package.json" "$VENDOR_DIR/kata-cli/package.json"

log "installing Kata CLI production dependencies"
(
  cd "$VENDOR_DIR/kata-cli"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
)

log "copying Kata skills"
cp -R "$ROOT_DIR/apps/cli/skills/." "$VENDOR_DIR/kata-skills/"

log "installing bundled Pi runtime"
cat > "$VENDOR_DIR/pi-runtime/package.json" <<EOF
{
  "name": "kata-desktop-pi-runtime",
  "private": true,
  "dependencies": {
    "@mariozechner/pi-coding-agent": "$PI_RUNTIME_VERSION"
  }
}
EOF
(
  cd "$VENDOR_DIR/pi-runtime"
  npm install --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null
)

if [ -f "$ROOT_DIR/apps/symphony/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  log "building Symphony (release)"
  (cd "$ROOT_DIR/apps/symphony" && cargo build --release)
fi

if [ -f "$ROOT_DIR/apps/symphony/target/release/symphony" ]; then
  cp "$ROOT_DIR/apps/symphony/target/release/symphony" "$VENDOR_DIR/symphony"
  chmod +x "$VENDOR_DIR/symphony"
fi

cat > "$VENDOR_DIR/pi" <<'EOF'
#!/usr/bin/env sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
export KATA_CLI_ROOT="$SCRIPT_DIR/kata-cli"
export KATA_SKILL_ROOT="$SCRIPT_DIR/kata-skills"
PI_CLI="$SCRIPT_DIR/pi-runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js"
if [ ! -f "$PI_CLI" ]; then
  echo "ERROR: bundled Pi runtime not found at $PI_CLI" >&2
  exit 127
fi

if [ -n "${KATA_ELECTRON_NODE:-}" ] && [ -x "$KATA_ELECTRON_NODE" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$KATA_ELECTRON_NODE" "$PI_CLI" "$@"
fi

exec node "$PI_CLI" "$@"
EOF

cat > "$VENDOR_DIR/pi.cmd" <<'EOF'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "KATA_CLI_ROOT=%SCRIPT_DIR%kata-cli"
set "KATA_SKILL_ROOT=%SCRIPT_DIR%kata-skills"
set "PI_CLI=%SCRIPT_DIR%pi-runtime\node_modules\@mariozechner\pi-coding-agent\dist\cli.js"
if not exist "%PI_CLI%" (
  echo ERROR: bundled Pi runtime not found at %PI_CLI% 1>&2
  exit /b 127
)

if defined KATA_ELECTRON_NODE (
  set "ELECTRON_RUN_AS_NODE=1"
  "%KATA_ELECTRON_NODE%" "%PI_CLI%" %*
  exit /b %ERRORLEVEL%
)

node "%PI_CLI%" %*
endlocal
EOF

chmod +x "$VENDOR_DIR/pi"

log "bundle complete"
log "launcher: $VENDOR_DIR/pi"
