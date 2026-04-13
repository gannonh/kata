#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/archive-legacy-apps.sh --dest <archive-repo> [--verify-only]

Copies the legacy desktop workspaces into a separate archive git repository,
records provenance for the handoff, and verifies the archive contents.

Options:
  --dest <path>     Path to the archive repository checkout (required)
  --verify-only     Do not export; only verify the archive repo contents
  -h, --help        Show this help text
EOF
}

fail() {
  echo "[archive-legacy-apps] ERROR: $*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ARCHIVE_DEST=""
VERIFY_ONLY=0
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
SOURCE_SHORT_SHA="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
SOURCE_BRANCH="$(git -C "$REPO_ROOT" branch --show-current)"
TIMESTAMP_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest)
      [[ $# -ge 2 ]] || fail "--dest requires a path"
      ARCHIVE_DEST="$2"
      shift 2
      ;;
    --verify-only)
      VERIFY_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$ARCHIVE_DEST" ]] || fail "Missing required --dest argument"

ARCHIVE_PARENT="$(cd "$(dirname "$ARCHIVE_DEST")" && pwd)"
ARCHIVE_DEST="$ARCHIVE_PARENT/$(basename "$ARCHIVE_DEST")"
ARCHIVE_APPS_DIR="$ARCHIVE_DEST/apps"
PROVENANCE_DIR="$ARCHIVE_DEST/provenance/M008-S04"
PROVENANCE_FILE="$PROVENANCE_DIR/export.json"
ARCHIVE_LOG="$PROVENANCE_DIR/export.log"

require_archive_repo() {
  mkdir -p "$ARCHIVE_DEST"
  if [[ ! -d "$ARCHIVE_DEST/.git" ]]; then
    echo "[archive-legacy-apps] Initializing archive repository at $ARCHIVE_DEST"
    git -C "$ARCHIVE_DEST" init -q -b main
  fi
}

export_app() {
  local app_name="$1"
  local source_dir="$REPO_ROOT/apps/$app_name"
  local dest_dir="$ARCHIVE_APPS_DIR/$app_name"

  [[ -d "$source_dir" ]] || fail "Source app directory not found: $source_dir"

  mkdir -p "$ARCHIVE_APPS_DIR"
  rm -rf "$dest_dir"
  rsync -a --delete "$source_dir/" "$dest_dir/"
}

write_provenance() {
  mkdir -p "$PROVENANCE_DIR"

  cat > "$PROVENANCE_FILE" <<EOF
{
  "slice": "KAT-2524",
  "milestone": "M008",
  "sourceRepoPath": "$REPO_ROOT",
  "sourceBranch": "$SOURCE_BRANCH",
  "sourceSha": "$SOURCE_SHA",
  "sourceShortSha": "$SOURCE_SHORT_SHA",
  "archiveRepoPath": "$ARCHIVE_DEST",
  "archivedAtUtc": "$TIMESTAMP_UTC",
  "archivedApps": [
    "apps/electron",
    "apps/viewer"
  ],
  "notes": "Legacy apps preserved in archive repo without renaming archive-only code or dependencies."
}
EOF

  cat > "$ARCHIVE_LOG" <<EOF
[$TIMESTAMP_UTC] archived apps/electron and apps/viewer
source repo: $REPO_ROOT
source branch: $SOURCE_BRANCH
source sha: $SOURCE_SHA
archive repo: $ARCHIVE_DEST
EOF
}

commit_archive() {
  git -C "$ARCHIVE_DEST" add apps provenance

  if git -C "$ARCHIVE_DEST" diff --cached --quiet; then
    echo "[archive-legacy-apps] Archive repository already up to date"
    return
  fi

  git -C "$ARCHIVE_DEST" \
    -c user.name="Kata Archive Bot" \
    -c user.email="archive-bot@kata.local" \
    commit -m "archive: import legacy apps from kata@$SOURCE_SHORT_SHA" >/dev/null

  echo "[archive-legacy-apps] Created archive commit $(git -C "$ARCHIVE_DEST" rev-parse --short HEAD)"
}

verify_archive() {
  [[ -d "$ARCHIVE_DEST/.git" ]] || fail "Archive repository missing at $ARCHIVE_DEST"
  [[ -f "$PROVENANCE_FILE" ]] || fail "Missing provenance record: $PROVENANCE_FILE"
  [[ -f "$ARCHIVE_APPS_DIR/electron/package.json" ]] || fail "Missing archived app: apps/electron"
  [[ -f "$ARCHIVE_APPS_DIR/viewer/package.json" ]] || fail "Missing archived app: apps/viewer"

  local electron_name viewer_name electron_deps_ok viewer_deps_ok
  electron_name="$(node -p "require(process.argv[1]).name" "$ARCHIVE_APPS_DIR/electron/package.json")"
  viewer_name="$(node -p "require(process.argv[1]).name" "$ARCHIVE_APPS_DIR/viewer/package.json")"
  electron_deps_ok="$(node -e "const pkg=require(process.argv[1]); const deps=Object.keys(pkg.dependencies||{}); console.log(deps.some(dep=>dep.startsWith('@craft-agent/')) ? 'yes' : 'no')" "$ARCHIVE_APPS_DIR/electron/package.json")"
  viewer_deps_ok="$(node -e "const pkg=require(process.argv[1]); const deps=Object.keys(pkg.dependencies||{}); console.log(deps.some(dep=>dep.startsWith('@craft-agent/')) ? 'yes' : 'no')" "$ARCHIVE_APPS_DIR/viewer/package.json")"

  [[ "$electron_name" == "@kata-sh/desktop" ]] || fail "Unexpected archived electron package name: $electron_name"
  [[ "$viewer_name" == "@craft-agent/viewer" ]] || fail "Unexpected archived viewer package name: $viewer_name"
  [[ "$electron_deps_ok" == "yes" ]] || fail "Archived electron package no longer carries legacy @craft-agent dependencies"
  [[ "$viewer_deps_ok" == "yes" ]] || fail "Archived viewer package no longer carries legacy @craft-agent dependencies"

  local recorded_source_sha recorded_archive_repo archive_head
  recorded_source_sha="$(node -p "require(process.argv[1]).sourceSha" "$PROVENANCE_FILE")"
  recorded_archive_repo="$(node -p "require(process.argv[1]).archiveRepoPath" "$PROVENANCE_FILE")"
  archive_head="$(git -C "$ARCHIVE_DEST" rev-parse --short HEAD)"

  echo "[archive-legacy-apps] Verified archive repository"
  echo "  source sha:    $recorded_source_sha"
  echo "  archive repo:  $recorded_archive_repo"
  echo "  archive head:  $archive_head"
  echo "  archived apps: apps/electron, apps/viewer"
}

if [[ "$VERIFY_ONLY" -eq 1 ]]; then
  verify_archive
  exit 0
fi

require_archive_repo
export_app electron
export_app viewer
write_provenance
commit_archive
verify_archive
