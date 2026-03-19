#!/usr/bin/env bash
# sync-worktrees.sh — Sync all worktrees after a PR merge on GitHub.
#
# For worktrees on their standby branch: hard-reset to origin/main.
# For worktrees on a feature branch: rebase onto origin/main.
#
# Usage:
#   ./scripts/sync-worktrees.sh            # sync all worktrees
#   ./scripts/sync-worktrees.sh --dry-run  # show what would happen without changing anything
#
# Safety:
#   - Refuses to reset standby worktrees with uncommitted changes
#   - Refuses to rebase feature branches with uncommitted changes
#   - Aborts rebase automatically on conflict (leaves worktree unchanged)
#   - Validates every worktree after sync
#   - Dry-run mode previews all actions without side effects

set -euo pipefail

# ─── Globals ───────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)" || true
DRY_RUN=false
errors=0
warnings=0

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; DIM=''; RESET=''
fi

# ─── Helpers ───────────────────────────────────────────────────────────────────

die()  { echo -e "${RED}FATAL:${RESET} $*" >&2; exit 1; }
err()  { echo -e "  ${RED}✗${RESET} $*" >&2; errors=$((errors + 1)); }
warn() { echo -e "  ${YELLOW}⚠${RESET} $*" >&2; warnings=$((warnings + 1)); }
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
info() { echo -e "  ${DIM}$*${RESET}"; }
step() { echo -e "\n${BOLD}$*${RESET}"; }

is_dirty() {
  [ -n "$(git -C "$1" status --porcelain --untracked-files=normal 2>/dev/null)" ]
}

short_sha() {
  git -C "$1" rev-parse --short HEAD 2>/dev/null
}

# ─── Parse args ────────────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=true ;;
    --help|-h)
      echo "Usage: sync-worktrees.sh [--dry-run]"
      echo "Sync all worktrees after a PR merge on GitHub."
      exit 0
      ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ─── Preflight ─────────────────────────────────────────────────────────────────

[ -n "$REPO_DIR" ] || die "Could not detect git repo root from $SCRIPT_DIR"

if $DRY_RUN; then
  echo -e "${YELLOW}DRY RUN — no changes will be made${RESET}"
fi

step "Fetching origin..."
if $DRY_RUN; then
  info "Would run: git fetch origin"
else
  git -C "$REPO_DIR" fetch origin --quiet || die "git fetch origin failed"
fi

TARGET_SHA=$(git -C "$REPO_DIR" rev-parse origin/main)
TARGET_SHORT="${TARGET_SHA:0:7}"
step "Target: origin/main @ ${TARGET_SHORT}"

# ─── Discover worktrees ───────────────────────────────────────────────────────

declare -a WT_PATHS=()
declare -a WT_BRANCHES=()
declare -a WT_NAMES=()

current_path=""
current_branch=""

while IFS= read -r line; do
  if [ -z "$line" ]; then
    if [ -n "$current_path" ] && [ -n "$current_branch" ]; then
      WT_PATHS+=("$current_path")
      WT_BRANCHES+=("$current_branch")
      WT_NAMES+=("$(basename "$current_path")")
    fi
    current_path=""
    current_branch=""
    continue
  fi
  case "$line" in
    worktree\ *)          current_path="${line#worktree }" ;;
    branch\ refs/heads/*) current_branch="${line#branch refs/heads/}" ;;
  esac
done < <(git -C "$REPO_DIR" worktree list --porcelain; echo "")

[ "${#WT_PATHS[@]}" -gt 0 ] || die "No worktrees found"

# ─── Classify and sync each worktree ──────────────────────────────────────────

synced=0
skipped=0
rebased=0

for i in "${!WT_PATHS[@]}"; do
  wt_path="${WT_PATHS[$i]}"
  branch="${WT_BRANCHES[$i]}"
  name="${WT_NAMES[$i]}"
  wt_sha=$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || echo "unknown")

  # ── Case 1: main branch (root worktree) ──────────────────────────────────
  if [ "$branch" = "main" ]; then
    step "[$name] main branch"

    if [ "$wt_sha" = "$TARGET_SHA" ]; then
      ok "Already at $TARGET_SHORT"
      synced=$((synced + 1))
      continue
    fi

    if is_dirty "$wt_path"; then
      err "$name: main has uncommitted changes — skipping"
      skipped=$((skipped + 1))
      continue
    fi

    if $DRY_RUN; then
      info "Would reset main to $TARGET_SHORT"
    else
      git -C "$wt_path" reset --hard "$TARGET_SHA" --quiet
      ok "Reset to $TARGET_SHORT"
    fi
    synced=$((synced + 1))
    continue
  fi

  # ── Case 2: standby branch (*-standby) ───────────────────────────────────
  if [[ "$branch" == *-standby ]]; then
    step "[$name] standby: $branch"

    if [ "$wt_sha" = "$TARGET_SHA" ]; then
      ok "Already at $TARGET_SHORT"
      synced=$((synced + 1))
      continue
    fi

    if is_dirty "$wt_path"; then
      err "$name: has uncommitted changes on standby — skipping"
      skipped=$((skipped + 1))
      continue
    fi

    if $DRY_RUN; then
      info "Would hard-reset $branch to $TARGET_SHORT"
      info "Would set upstream to origin/main"
    else
      git -C "$wt_path" reset --hard "$TARGET_SHA" --quiet
      git -C "$wt_path" branch --set-upstream-to=origin/main "$branch" >/dev/null 2>&1 || true
      ok "Reset to $TARGET_SHORT"
    fi
    synced=$((synced + 1))
    continue
  fi

  # ── Case 3: feature branch (active work) ─────────────────────────────────
  step "[$name] feature: $branch"

  # Check if already up to date (branch contains origin/main)
  if git -C "$wt_path" merge-base --is-ancestor "$TARGET_SHA" HEAD 2>/dev/null; then
    ok "Already contains $TARGET_SHORT — no rebase needed"
    synced=$((synced + 1))
    continue
  fi

  # Count how many commits are ahead/behind
  behind=$(git -C "$wt_path" rev-list --count HEAD.."$TARGET_SHA" 2>/dev/null || echo "?")
  ahead=$(git -C "$wt_path" rev-list --count "$TARGET_SHA"..HEAD 2>/dev/null || echo "?")
  info "$ahead commits ahead, $behind behind origin/main"

  if is_dirty "$wt_path"; then
    err "$name: has uncommitted changes — skipping rebase"
    skipped=$((skipped + 1))
    continue
  fi

  if $DRY_RUN; then
    info "Would rebase $branch onto origin/main"
  else
    # Attempt rebase — abort on any conflict
    if git -C "$wt_path" rebase origin/main --quiet 2>/dev/null; then
      new_sha=$(short_sha "$wt_path")
      ok "Rebased onto $TARGET_SHORT (now at $new_sha)"
      rebased=$((rebased + 1))
    else
      # Conflict — abort the rebase, leave worktree unchanged
      git -C "$wt_path" rebase --abort 2>/dev/null || true
      err "$name: rebase conflict — aborted, worktree unchanged"
      warn "$name: resolve manually: cd $wt_path && git rebase origin/main"
      skipped=$((skipped + 1))
      continue
    fi
  fi
  synced=$((synced + 1))
done

# ─── Validation ────────────────────────────────────────────────────────────────

step "Validating..."

validation_ok=true

for i in "${!WT_PATHS[@]}"; do
  wt_path="${WT_PATHS[$i]}"
  branch="${WT_BRANCHES[$i]}"
  name="${WT_NAMES[$i]}"
  wt_sha=$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || echo "unknown")

  # Standby and main should be exactly at target
  if [ "$branch" = "main" ] || [[ "$branch" == *-standby ]]; then
    if $DRY_RUN; then
      info "$name: would verify SHA matches $TARGET_SHORT"
    elif [ "$wt_sha" != "$TARGET_SHA" ]; then
      err "$name: expected $TARGET_SHORT but at ${wt_sha:0:7}"
      validation_ok=false
    else
      ok "$name: $branch @ $TARGET_SHORT"
    fi
  else
    # Feature branch should contain origin/main
    if $DRY_RUN; then
      info "$name: would verify $branch contains $TARGET_SHORT"
    elif git -C "$wt_path" merge-base --is-ancestor "$TARGET_SHA" HEAD 2>/dev/null; then
      ok "$name: $branch contains $TARGET_SHORT (at ${wt_sha:0:7})"
    else
      err "$name: $branch does NOT contain $TARGET_SHORT"
      validation_ok=false
    fi
  fi

  # Check for dirty state (should be clean after sync)
  if ! $DRY_RUN && is_dirty "$wt_path"; then
    err "$name: working tree is dirty after sync"
    validation_ok=false
  fi

  # Check for detached HEAD
  current_branch=$(git -C "$wt_path" branch --show-current 2>/dev/null)
  if ! $DRY_RUN && [ -z "$current_branch" ]; then
    err "$name: detached HEAD"
    validation_ok=false
  fi

  # Check for in-progress rebase
  if ! $DRY_RUN && [ -d "$wt_path/.git/rebase-merge" ] || [ -d "$wt_path/.git/rebase-apply" ]; then
    err "$name: rebase in progress"
    validation_ok=false
  fi
done

# ─── Summary ───────────────────────────────────────────────────────────────────

step "Summary"
total=${#WT_PATHS[@]}
echo -e "  Worktrees: $total total, ${GREEN}$synced synced${RESET}, ${BLUE}$rebased rebased${RESET}, ${YELLOW}$skipped skipped${RESET}"

if [ "$errors" -gt 0 ]; then
  echo -e "  ${RED}$errors error(s)${RESET}"
fi
if [ "$warnings" -gt 0 ]; then
  echo -e "  ${YELLOW}$warnings warning(s)${RESET}"
fi

if $DRY_RUN; then
  echo -e "\n${YELLOW}Dry run complete — no changes were made.${RESET}"
  exit 0
fi

if [ "$errors" -gt 0 ] || [ "$validation_ok" = false ]; then
  echo -e "\n${RED}Sync completed with errors. Review above.${RESET}"
  exit 1
fi

echo -e "\n${GREEN}All worktrees synced to origin/main ($TARGET_SHORT).${RESET}"
