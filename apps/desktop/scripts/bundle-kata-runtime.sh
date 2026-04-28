#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$DESKTOP_DIR/../.." && pwd)"
VENDOR_DIR="$DESKTOP_DIR/vendor"

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
mkdir -p "$VENDOR_DIR/kata-cli" "$VENDOR_DIR/kata-skills"

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
exec pi "$@"
EOF

cat > "$VENDOR_DIR/pi.cmd" <<'EOF'
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "KATA_CLI_ROOT=%SCRIPT_DIR%kata-cli"
set "KATA_SKILL_ROOT=%SCRIPT_DIR%kata-skills"
pi %*
endlocal
EOF

chmod +x "$VENDOR_DIR/pi"

log "bundle complete"
log "launcher: $VENDOR_DIR/pi"
