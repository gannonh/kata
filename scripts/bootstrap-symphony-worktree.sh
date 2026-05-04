#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[symphony-bootstrap] %s\n' "$*"
}

die() {
  printf '[symphony-bootstrap] ERROR: %s\n' "$*" >&2
  exit 1
}

copy_if_present() {
  local source_path="$1"
  local target_path="$2"

  if [[ ! -e "$source_path" ]]; then
    log "skip missing $source_path"
    return 0
  fi

  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
  log "copied ${source_path#$SOURCE_TREE/} -> ${target_path#$WORKTREE/}"
}

infer_source_tree() {
  local current="$1"
  local candidate=""

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        candidate="${line#worktree }"
        ;;
      branch\ refs/heads/main)
        if [[ "$candidate" != "$current" && -d "$candidate/.git" ]]; then
          printf '%s\n' "$candidate"
          return 0
        fi
        ;;
    esac
  done < <(git -C "$current" worktree list --porcelain)

  while IFS= read -r line; do
    case "$line" in
      worktree\ *)
        candidate="${line#worktree }"
        if [[ "$candidate" != "$current" && -f "$candidate/.env" ]]; then
          printf '%s\n' "$candidate"
          return 0
        fi
        ;;
    esac
  done < <(git -C "$current" worktree list --porcelain)

  return 1
}

WORKTREE="${SYMPHONY_WORKSPACE_PATH:-$(pwd)}"
WORKTREE="$(cd "$WORKTREE" && pwd)"

SOURCE_TREE="${1:-${SYMPHONY_SOURCE_TREE_PATH:-}}"
if [[ -z "$SOURCE_TREE" ]]; then
  SOURCE_TREE="$(infer_source_tree "$WORKTREE")" || die "could not infer source checkout; pass it as the first argument or set SYMPHONY_SOURCE_TREE_PATH"
fi
SOURCE_TREE="$(cd "$SOURCE_TREE" && pwd)"

if [[ "$SOURCE_TREE" == "$WORKTREE" ]]; then
  die "source checkout and worktree are the same path: $SOURCE_TREE"
fi

log "source: $SOURCE_TREE"
log "worktree: $WORKTREE"

copy_if_present "$SOURCE_TREE/.env" "$WORKTREE/.env"
copy_if_present "$SOURCE_TREE/apps/desktop/.env.development" "$WORKTREE/apps/desktop/.env.development"

log "installing workspace dependencies"
pnpm --dir "$WORKTREE" install

log "building Symphony release binary"
cargo build --manifest-path "$WORKTREE/apps/symphony/Cargo.toml" --release

log "building Kata CLI for Pi"
pnpm --dir "$WORKTREE" build:cli:pi

log "bootstrap complete"
