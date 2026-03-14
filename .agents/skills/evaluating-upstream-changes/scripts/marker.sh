#!/usr/bin/env bash
#
# marker.sh — Read and write upstream evaluation markers
#
# Tracks the last-evaluated commit from each upstream source so subsequent
# evaluations only look at new changes.
#
# Markers are stored in the kata-mono repo (committed alongside integration PRs)
# so they survive across machines and sessions.
#
# Usage:
#   ./marker.sh read                    # Show current markers
#   ./marker.sh write [eval-output-dir] # Save markers from an evaluation run
#   ./marker.sh range                   # Output git log ranges for new changes
#
# Marker file: /Volumes/EVO/kata/kata-mono/.planning/upstream-evals/LAST-EVAL.json

set -euo pipefail

KATA_MONO_ROOT="/Volumes/EVO/kata/kata-mono"
GSD_PI_ROOT="/Volumes/EVO/kata/gsd-pi"
PI_MONO_ROOT="/Volumes/EVO/kata/pi-mono"
MARKER_DIR="$KATA_MONO_ROOT/.planning/upstream-evals"
MARKER_FILE="$MARKER_DIR/LAST-EVAL.json"

cmd="${1:-read}"

case "$cmd" in
  read)
    if [ ! -f "$MARKER_FILE" ]; then
      echo "No previous evaluation found."
      echo "Run an evaluation first, then use 'marker.sh write <eval-dir>' to save the marker."
      exit 0
    fi

    echo "=== Last Upstream Evaluation ==="
    echo ""
    echo "Date:             $(jq -r '.date' "$MARKER_FILE")"
    echo "gsd-pi commit:    $(jq -r '.gsd_pi.commit' "$MARKER_FILE")"
    echo "gsd-pi version:   $(jq -r '.gsd_pi.version' "$MARKER_FILE")"
    echo "pi-mono commit:   $(jq -r '.pi_mono.commit' "$MARKER_FILE")"
    echo "pi-mono version:  $(jq -r '.pi_mono.version' "$MARKER_FILE")"
    echo ""

    # Show how many new commits since last eval
    LAST_GSD=$(jq -r '.gsd_pi.commit' "$MARKER_FILE")
    LAST_PI=$(jq -r '.pi_mono.commit' "$MARKER_FILE")

    GSD_NEW=$(git -C "$GSD_PI_ROOT" rev-list "$LAST_GSD..HEAD" 2>/dev/null | wc -l | tr -d ' ')
    PI_NEW=$(git -C "$PI_MONO_ROOT" rev-list "$LAST_PI..HEAD" -- packages/coding-agent/ 2>/dev/null | wc -l | tr -d ' ')

    echo "New commits since last eval:"
    echo "  gsd-pi:   $GSD_NEW"
    echo "  pi-mono:  $PI_NEW (coding-agent only)"
    ;;

  write)
    EVAL_DIR="${2:-}"

    # Get current HEADs
    GSD_HEAD=$(git -C "$GSD_PI_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
    GSD_VERSION=$(grep '"version"' "$GSD_PI_ROOT/package.json" | head -1 | sed 's/.*: *"//;s/".*//')
    PI_HEAD=$(git -C "$PI_MONO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")
    PI_VERSION=$(grep '"version"' "$PI_MONO_ROOT/packages/coding-agent/package.json" | head -1 | sed 's/.*: *"//;s/".*//')
    KATA_HEAD=$(git -C "$KATA_MONO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

    # If eval dir provided, use its metadata instead
    if [ -n "$EVAL_DIR" ] && [ -f "$EVAL_DIR/eval-metadata.json" ]; then
      GSD_HEAD=$(jq -r '.gsd_pi_head' "$EVAL_DIR/eval-metadata.json")
      GSD_VERSION=$(jq -r '.gsd_pi_version' "$EVAL_DIR/eval-metadata.json")
    fi

    mkdir -p "$MARKER_DIR"

    cat > "$MARKER_FILE" << EOF
{
  "date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gsd_pi": {
    "commit": "$GSD_HEAD",
    "version": "$GSD_VERSION"
  },
  "pi_mono": {
    "commit": "$PI_HEAD",
    "version": "$PI_VERSION"
  },
  "kata_mono_head_at_eval": "$KATA_HEAD"
}
EOF

    echo "Marker saved: $MARKER_FILE"
    echo ""
    echo "  gsd-pi:  $GSD_HEAD ($GSD_VERSION)"
    echo "  pi-mono: $PI_HEAD ($PI_VERSION)"
    echo ""
    echo "Commit this file with your integration PR so future evaluations know where to start."
    ;;

  range)
    if [ ! -f "$MARKER_FILE" ]; then
      echo "No previous evaluation. Cannot compute range."
      echo "For first run, use the full evaluation (normalize.sh + delta-report.sh)."
      exit 1
    fi

    LAST_GSD=$(jq -r '.gsd_pi.commit' "$MARKER_FILE")
    LAST_PI=$(jq -r '.pi_mono.commit' "$MARKER_FILE")
    GSD_HEAD=$(git -C "$GSD_PI_ROOT" rev-parse HEAD)
    PI_HEAD=$(git -C "$PI_MONO_ROOT" rev-parse HEAD)

    echo "=== Ranges for New Changes ==="
    echo ""

    if [ "$LAST_GSD" = "$GSD_HEAD" ]; then
      echo "gsd-pi: no new commits"
    else
      echo "gsd-pi: $LAST_GSD..$GSD_HEAD"
      echo "  Preview:"
      git -C "$GSD_PI_ROOT" log --oneline "$LAST_GSD..$GSD_HEAD" | head -20
    fi

    echo ""

    if [ "$LAST_PI" = "$PI_HEAD" ]; then
      echo "pi-mono: no new commits (coding-agent)"
    else
      echo "pi-mono: $LAST_PI..$PI_HEAD (coding-agent)"
      echo "  Preview:"
      git -C "$PI_MONO_ROOT" log --oneline "$LAST_PI..$PI_HEAD" -- packages/coding-agent/ | head -20
    fi
    ;;

  *)
    echo "Usage: marker.sh {read|write [eval-dir]|range}"
    exit 1
    ;;
esac
