#!/usr/bin/env bash
#
# delta-report.sh — Generate a structured feature delta between normalized trees
#
# Reads the output of normalize.sh and produces a categorized report:
#   - Files only in gsd (features kata lacks)
#   - Files only in kata (kata-specific additions)
#   - Files in both but different (diverged implementations)
#   - Files identical (shared base, no action needed)
#
# Usage:
#   ./delta-report.sh <normalized-output-dir>
#   Example: ./delta-report.sh /tmp/upstream-eval-20260313-120000

set -uo pipefail

EVAL_DIR="${1:?Usage: delta-report.sh <normalized-output-dir>}"
NORM_GSD="$EVAL_DIR/normalized-gsd"
NORM_KATA="$EVAL_DIR/normalized-kata"

if [ ! -d "$NORM_GSD" ] || [ ! -d "$NORM_KATA" ]; then
  echo "Error: normalized directories not found in $EVAL_DIR"
  echo "Run normalize.sh first."
  exit 1
fi

REPORT="$EVAL_DIR/DELTA-REPORT.md"

echo "=== Delta Report Generator ==="
echo "Comparing: $NORM_GSD vs $NORM_KATA"

# --- Collect file inventories ---

GSD_FILES=$(cd "$NORM_GSD" && find . -type f | sort)
KATA_FILES=$(cd "$NORM_KATA" && find . -type f | sort)

ONLY_GSD=$(comm -23 <(echo "$GSD_FILES") <(echo "$KATA_FILES"))
ONLY_KATA=$(comm -13 <(echo "$GSD_FILES") <(echo "$KATA_FILES"))
BOTH=$(comm -12 <(echo "$GSD_FILES") <(echo "$KATA_FILES"))

# --- Categorize shared files ---

IDENTICAL=""
DIVERGED=""

while IFS= read -r file; do
  [ -z "$file" ] && continue
  if diff -q "$NORM_GSD/$file" "$NORM_KATA/$file" > /dev/null 2>&1; then
    IDENTICAL+="$file"$'\n'
  else
    DIVERGED+="$file"$'\n'
  fi
done <<< "$BOTH"

# --- Count by area ---

count_by_area() {
  local files="$1"
  echo "$files" | grep -c 'extensions/' 2>/dev/null || echo 0
}

# --- Write report ---

cat > "$REPORT" << 'HEADER'
# Upstream Delta Report

HEADER

cat >> "$REPORT" << EOF
**Generated:** $(date -u +"%Y-%m-%d %H:%M UTC")
**gsd-pi HEAD:** $(jq -r '.gsd_pi_head' "$EVAL_DIR/eval-metadata.json" 2>/dev/null || echo 'unknown')
**gsd-pi version:** $(jq -r '.gsd_pi_version' "$EVAL_DIR/eval-metadata.json" 2>/dev/null || echo 'unknown')
**kata CLI HEAD:** $(jq -r '.kata_cli_head' "$EVAL_DIR/eval-metadata.json" 2>/dev/null || echo 'unknown')
**kata CLI version:** $(jq -r '.kata_cli_version' "$EVAL_DIR/eval-metadata.json" 2>/dev/null || echo 'unknown')

## Summary

| Category | Count | Description |
|----------|-------|-------------|
| Only in gsd-pi | $(echo "$ONLY_GSD" | grep -c '.' || echo 0) | Features kata could adopt |
| Only in kata | $(echo "$ONLY_KATA" | grep -c '.' || echo 0) | Kata-specific additions |
| Diverged | $(echo "$DIVERGED" | grep -c '.' || echo 0) | Same file, different content |
| Identical | $(echo "$IDENTICAL" | grep -c '.' || echo 0) | No action needed |

## Files Only in gsd-pi

These are candidates for integration. After normalization, these files exist in gsd-pi but not in kata.

EOF

if [ -n "$ONLY_GSD" ]; then
  # Group by top-level directory
  echo "$ONLY_GSD" | sed 's|^\./||' | while read -r f; do
    area=$(echo "$f" | cut -d'/' -f1-3)
    echo "- \`$f\`"
  done >> "$REPORT"
else
  echo "_None_" >> "$REPORT"
fi

cat >> "$REPORT" << 'EOF'

## Files Only in kata

Kata-specific files not present in gsd-pi.

EOF

if [ -n "$ONLY_KATA" ]; then
  echo "$ONLY_KATA" | sed 's|^\./||' | while read -r f; do
    echo "- \`$f\`"
  done >> "$REPORT"
else
  echo "_None_" >> "$REPORT"
fi

cat >> "$REPORT" << 'EOF'

## Diverged Files

Present in both but content differs (after normalization). These need manual review.

EOF

if [ -n "$DIVERGED" ]; then
  echo "$DIVERGED" | sed 's|^\./||' | while read -r f; do
    # Count diff lines as a rough measure of divergence
    difflines=$(diff -u "$NORM_GSD/./$f" "$NORM_KATA/./$f" 2>/dev/null | wc -l | tr -d ' ')
    echo "- \`$f\` ($difflines diff lines)"
  done >> "$REPORT"
else
  echo "_None_" >> "$REPORT"
fi

cat >> "$REPORT" << 'EOF'

## Identical Files

These files are the same after normalization. No action needed.

<details>
<summary>Show identical files</summary>

EOF

if [ -n "$IDENTICAL" ]; then
  echo "$IDENTICAL" | sed 's|^\./||' | while read -r f; do
    echo "- \`$f\`"
  done >> "$REPORT"
else
  echo "_None_" >> "$REPORT"
fi

echo "</details>" >> "$REPORT"

# --- Extensions deep dive ---

cat >> "$REPORT" << 'EOF'

## Extension Comparison

Detailed look at the extensions directory, since this is where most portable features live.

EOF

GSD_EXT="$NORM_GSD/src/resources/extensions"
KATA_EXT="$NORM_KATA/src/resources/extensions"

if [ -d "$GSD_EXT" ] && [ -d "$KATA_EXT" ]; then
  GSD_EXTS=$(ls -1 "$GSD_EXT" 2>/dev/null | sort)
  KATA_EXTS=$(ls -1 "$KATA_EXT" 2>/dev/null | sort)

  echo "| Extension | gsd-pi | kata | Status |" >> "$REPORT"
  echo "|-----------|--------|------|--------|" >> "$REPORT"

  ALL_EXTS=$(echo -e "$GSD_EXTS\n$KATA_EXTS" | sort -u)
  while read -r ext; do
    [ -z "$ext" ] && continue
    in_gsd="No"; in_kata="No"; status="--"
    [ -e "$GSD_EXT/$ext" ] && in_gsd="Yes"
    [ -e "$KATA_EXT/$ext" ] && in_kata="Yes"

    if [ "$in_gsd" = "Yes" ] && [ "$in_kata" = "No" ]; then
      status="Candidate for integration"
    elif [ "$in_gsd" = "No" ] && [ "$in_kata" = "Yes" ]; then
      status="Kata-specific"
    elif [ "$in_gsd" = "Yes" ] && [ "$in_kata" = "Yes" ]; then
      # Check if contents differ
      if diff -rq "$GSD_EXT/$ext" "$KATA_EXT/$ext" > /dev/null 2>&1; then
        status="Identical"
      else
        diffcount=$(diff -r "$GSD_EXT/$ext" "$KATA_EXT/$ext" 2>/dev/null | grep -c '^[<>]' || true)
        diffcount=$(echo "$diffcount" | tr -d '[:space:]')
        status="Diverged (${diffcount:-0} lines)"
      fi
    fi

    echo "| $ext | $in_gsd | $in_kata | $status |" >> "$REPORT"
  done <<< "$ALL_EXTS"
fi

echo ""
echo "Report saved: $REPORT"
echo ""

# Print summary to console
echo "=== Quick Summary ==="
echo "Only in gsd-pi: $(echo "$ONLY_GSD" | grep -c '.' || echo 0) files"
echo "Only in kata:   $(echo "$ONLY_KATA" | grep -c '.' || echo 0) files"
echo "Diverged:       $(echo "$DIVERGED" | grep -c '.' || echo 0) files"
echo "Identical:      $(echo "$IDENTICAL" | grep -c '.' || echo 0) files"
