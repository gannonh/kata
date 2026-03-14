#!/usr/bin/env bash
#
# normalize.sh — Create comparable snapshots of gsd-pi and kata-mono CLI
#
# Copies both projects into a temp directory with:
#   1. Paths aligned to a common root (gsd-pi's src/ maps to kata's apps/cli/src/)
#   2. All gsd/GSD naming transformed to kata/Kata equivalents
#   3. Non-source files stripped (node_modules, dist, .git, etc.)
#
# Output: two directories side-by-side ready for diff
#
# Usage:
#   ./normalize.sh [output-dir]
#   Default output: /tmp/upstream-eval-<timestamp>

set -euo pipefail

GSD_PI_ROOT="/Volumes/EVO/kata/gsd-pi"
KATA_CLI_ROOT="/Volumes/EVO/kata/kata-mono/apps/cli"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_DIR="${1:-/tmp/upstream-eval-$TIMESTAMP}"

NORM_GSD="$OUTPUT_DIR/normalized-gsd"
NORM_KATA="$OUTPUT_DIR/normalized-kata"

echo "=== Upstream Normalizer ==="
echo "Output: $OUTPUT_DIR"

mkdir -p "$NORM_GSD" "$NORM_KATA"

# --- Copy source trees, excluding noise ---

EXCLUDE_PATTERNS=(
  --exclude='node_modules'
  --exclude='dist'
  --exclude='.git'
  --exclude='.DS_Store'
  --exclude='*.map'
  --exclude='bun.lock'
  --exclude='package-lock.json'
  --exclude='.bg-shell'
)

echo "Copying gsd-pi sources..."
rsync -a "${EXCLUDE_PATTERNS[@]}" "$GSD_PI_ROOT/src/" "$NORM_GSD/src/"
rsync -a "${EXCLUDE_PATTERNS[@]}" "$GSD_PI_ROOT/docs/" "$NORM_GSD/docs/" 2>/dev/null || true
cp "$GSD_PI_ROOT/package.json" "$NORM_GSD/" 2>/dev/null || true

echo "Copying kata CLI sources..."
rsync -a "${EXCLUDE_PATTERNS[@]}" "$KATA_CLI_ROOT/src/" "$NORM_KATA/src/"
rsync -a "${EXCLUDE_PATTERNS[@]}" "$KATA_CLI_ROOT/docs/" "$NORM_KATA/docs/" 2>/dev/null || true
cp "$KATA_CLI_ROOT/package.json" "$NORM_KATA/" 2>/dev/null || true

# --- Normalize gsd-pi naming to kata equivalents ---

echo "Normalizing gsd-pi naming -> kata..."

# Content replacements first (before renaming files/dirs)
find "$NORM_GSD" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.md' -o -name '*.json' -o -name '*.yaml' -o -name '*.yml' \) | while read -r file; do
  sed -i '' \
    -e 's/gsd-pi/kata-cli/g' \
    -e 's/gsd_pi/kata_cli/g' \
    -e 's/GSD_CODING_AGENT_DIR/KATA_CODING_AGENT_DIR/g' \
    -e 's/GSD_WORKFLOW_PATH/KATA_WORKFLOW_PATH/g' \
    -e 's/GSD_BUNDLED_EXTENSION_PATHS/KATA_BUNDLED_EXTENSION_PATHS/g' \
    -e 's/GSD_BIN_PATH/KATA_BIN_PATH/g' \
    -e 's/GSD_VERSION/KATA_VERSION/g' \
    -e 's/GSD_WORKFLOW/KATA_WORKFLOW/g' \
    -e 's/GSD-WORKFLOW/KATA-WORKFLOW/g' \
    -e 's/\.gsd\//\.kata-cli\//g' \
    -e 's/"gsd"/"kata"/g' \
    -e 's/\/gsd /\/kata /g' \
    -e 's/\/gsd:/\/kata:/g' \
    -e 's/gsd-/kata-/g' \
    -e 's/GSD /Kata /g' \
    -e 's/GSD$/Kata/g' \
    "$file" 2>/dev/null || true
done

# File/directory renames: gsd -> kata (files first, then dirs bottom-up)
# Only rename inside the normalized-gsd tree, not the top-level dir itself
find "$NORM_GSD" -mindepth 1 -type f -name '*gsd*' | while read -r path; do
  dir=$(dirname "$path")
  base=$(basename "$path")
  newbase=$(echo "$base" | sed 's/gsd/kata/g; s/GSD/KATA/g; s/Gsd/Kata/g')
  [ "$base" != "$newbase" ] && mv "$path" "$dir/$newbase"
done
find "$NORM_GSD" -mindepth 1 -depth -type d -name '*gsd*' | while read -r path; do
  dir=$(dirname "$path")
  base=$(basename "$path")
  newbase=$(echo "$base" | sed 's/gsd/kata/g; s/GSD/KATA/g; s/Gsd/Kata/g')
  [ "$base" != "$newbase" ] && mv "$path" "$dir/$newbase"
done

echo ""
echo "Done. Normalized trees:"
echo "  gsd (as kata): $NORM_GSD"
echo "  kata:          $NORM_KATA"
echo ""
echo "Next steps:"
echo "  diff -rq $NORM_GSD $NORM_KATA                    # files that differ"
echo "  diff -ru $NORM_GSD $NORM_KATA | less              # full unified diff"
echo "  diff -ru $NORM_GSD/src/resources/extensions/ $NORM_KATA/src/resources/extensions/  # extensions only"

# Save metadata
cat > "$OUTPUT_DIR/eval-metadata.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "gsd_pi_head": "$(git -C "$GSD_PI_ROOT" rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gsd_pi_version": "$(grep '"version"' "$GSD_PI_ROOT/package.json" | head -1 | sed 's/.*: *"//;s/".*//')",
  "kata_cli_head": "$(git -C /Volumes/EVO/kata/kata-mono rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "kata_cli_version": "$(grep '"version"' "$KATA_CLI_ROOT/package.json" | head -1 | sed 's/.*: *"//;s/".*//')",
  "normalized_gsd": "$NORM_GSD",
  "normalized_kata": "$NORM_KATA"
}
EOF

echo "Metadata saved: $OUTPUT_DIR/eval-metadata.json"
