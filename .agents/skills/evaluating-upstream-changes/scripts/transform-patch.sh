#!/usr/bin/env bash
#
# transform-patch.sh — Extract a gsd-pi commit range as a kata-ready patch
#
# Takes a commit or range from gsd-pi, generates a patch, then transforms:
#   1. Paths: src/ -> apps/cli/src/
#   2. Names: gsd -> kata, GSD -> KATA, .gsd -> .kata-cli
#   3. Config: env vars, config dirs, package names
#
# The transformed patch can then be reviewed and applied to kata-mono.
#
# Usage:
#   ./transform-patch.sh <commit-or-range> [output-dir]
#
# Examples:
#   ./transform-patch.sh abc123f                          # single commit
#   ./transform-patch.sh abc123f..def456g                 # range
#   ./transform-patch.sh abc123f /tmp/patches             # custom output
#   ./transform-patch.sh v2.4.0..v2.5.0                   # tag range

set -euo pipefail

GSD_PI_ROOT="/Volumes/EVO/kata/gsd-pi"
KATA_MONO_ROOT="/Volumes/EVO/kata/kata-mono"

RANGE="${1:?Usage: transform-patch.sh <commit-or-range> [output-dir]}"
OUTPUT_DIR="${2:-/tmp/kata-patches-$(date +%Y%m%d-%H%M%S)}"

mkdir -p "$OUTPUT_DIR"

echo "=== Patch Transformer ==="
echo "Source: gsd-pi @ $RANGE"
echo "Output: $OUTPUT_DIR"

# --- Generate raw patches ---

echo ""
echo "Generating patches from gsd-pi..."

# Check if it's a range or single commit
if [[ "$RANGE" == *".."* ]]; then
  git -C "$GSD_PI_ROOT" format-patch "$RANGE" -o "$OUTPUT_DIR/raw" --no-stat
else
  git -C "$GSD_PI_ROOT" format-patch -1 "$RANGE" -o "$OUTPUT_DIR/raw" --no-stat
fi

RAW_COUNT=$(find "$OUTPUT_DIR/raw" -name '*.patch' 2>/dev/null | wc -l | tr -d ' ')
echo "Generated $RAW_COUNT raw patch(es)"

if [ "$RAW_COUNT" -eq 0 ]; then
  echo "No patches generated. Check your commit range."
  exit 1
fi

# --- Transform patches ---

echo ""
echo "Transforming patches..."

mkdir -p "$OUTPUT_DIR/transformed"

for patch in "$OUTPUT_DIR/raw"/*.patch; do
  basename=$(basename "$patch")
  out="$OUTPUT_DIR/transformed/$basename"

  sed \
    -e 's|a/src/|a/apps/cli/src/|g' \
    -e 's|b/src/|b/apps/cli/src/|g' \
    -e 's|a/docs/|a/apps/cli/docs/|g' \
    -e 's|b/docs/|b/apps/cli/docs/|g' \
    -e 's|a/pkg/|a/apps/cli/pkg/|g' \
    -e 's|b/pkg/|b/apps/cli/pkg/|g' \
    -e 's|a/scripts/|a/apps/cli/scripts/|g' \
    -e 's|b/scripts/|b/apps/cli/scripts/|g' \
    -e 's|a/patches/|a/apps/cli/patches/|g' \
    -e 's|b/patches/|b/apps/cli/patches/|g' \
    -e 's|a/package\.json|a/apps/cli/package.json|g' \
    -e 's|b/package\.json|b/apps/cli/package.json|g' \
    -e 's|a/tsconfig\.json|a/apps/cli/tsconfig.json|g' \
    -e 's|b/tsconfig\.json|b/apps/cli/tsconfig.json|g' \
    -e 's|gsd-pi|kata-cli|g' \
    -e 's|gsd_pi|kata_cli|g' \
    -e 's|GSD_CODING_AGENT_DIR|KATA_CODING_AGENT_DIR|g' \
    -e 's|GSD_WORKFLOW_PATH|KATA_WORKFLOW_PATH|g' \
    -e 's|GSD_BUNDLED_EXTENSION_PATHS|KATA_BUNDLED_EXTENSION_PATHS|g' \
    -e 's|GSD_BIN_PATH|KATA_BIN_PATH|g' \
    -e 's|GSD_VERSION|KATA_VERSION|g' \
    -e 's|GSD_WORKFLOW|KATA_WORKFLOW|g' \
    -e 's|GSD-WORKFLOW|KATA-WORKFLOW|g' \
    -e 's|\.gsd/|.kata-cli/|g' \
    -e 's|"gsd"|"kata"|g' \
    -e 's|/gsd |/kata |g' \
    -e 's|/gsd:|/kata:|g' \
    -e 's|gsd-|kata-|g' \
    -e 's|extensions/gsd/|extensions/kata/|g' \
    -e 's|GSD |Kata |g' \
    -e 's|GSD$|Kata|g' \
    "$patch" > "$out"

  echo "  $basename -> transformed"
done

# --- Dry-run apply ---

echo ""
echo "Dry-run applying to kata-mono..."

APPLY_OK=0
APPLY_FAIL=0
APPLY_RESULTS="$OUTPUT_DIR/apply-results.txt"
> "$APPLY_RESULTS"

for patch in "$OUTPUT_DIR/transformed"/*.patch; do
  basename=$(basename "$patch")
  if git -C "$KATA_MONO_ROOT" apply --check "$patch" 2>/dev/null; then
    echo "  OK:   $basename"
    echo "OK: $basename" >> "$APPLY_RESULTS"
    ((APPLY_OK++)) || true
  else
    echo "  FAIL: $basename"
    # Capture the error
    git -C "$KATA_MONO_ROOT" apply --check "$patch" 2>> "$APPLY_RESULTS" || true
    echo "FAIL: $basename" >> "$APPLY_RESULTS"
    ((APPLY_FAIL++)) || true
  fi
done

echo ""
echo "=== Results ==="
echo "Patches that apply cleanly: $APPLY_OK"
echo "Patches that need manual work: $APPLY_FAIL"
echo ""
echo "Transformed patches: $OUTPUT_DIR/transformed/"
echo "Apply results: $APPLY_RESULTS"
echo ""

if [ "$APPLY_OK" -gt 0 ]; then
  echo "To apply clean patches:"
  echo "  git -C $KATA_MONO_ROOT apply $OUTPUT_DIR/transformed/<patch-file>"
fi

if [ "$APPLY_FAIL" -gt 0 ]; then
  echo ""
  echo "For failed patches, try with --3way for conflict markers:"
  echo "  git -C $KATA_MONO_ROOT apply --3way $OUTPUT_DIR/transformed/<patch-file>"
  echo ""
  echo "Or review the raw diff and port manually."
fi
