#!/usr/bin/env bash
# Find a phase directory across active/pending/completed states.
# Usage: find-phase.sh <phase-arg>
# Output: key=value pairs (PHASE_DIR, PLAN_COUNT, PHASE_STATE)
# Exit: 0=found, 1=not found, 2=found but no plans

set -euo pipefail

PHASE_ARG="${1:?Usage: find-phase.sh <phase-arg>}"
PADDED=$(printf "%02d" "$PHASE_ARG" 2>/dev/null || echo "$PHASE_ARG")

PHASE_DIR=""
PHASE_STATE=""

for state in active pending completed; do
  dir=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$dir" ] && dir=$(find .planning/phases/${state} -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
  if [ -n "$dir" ]; then
    PHASE_DIR="$dir"
    PHASE_STATE="$state"
    break
  fi
done

# Fallback: flat directory (backward compatibility for unmigrated projects)
if [ -z "$PHASE_DIR" ]; then
  PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | head -1)
  [ -z "$PHASE_DIR" ] && PHASE_DIR=$(find .planning/phases -maxdepth 1 -type d -name "${PHASE_ARG}-*" 2>/dev/null | head -1)
  [ -n "$PHASE_DIR" ] && PHASE_STATE="flat"
fi

# Collision detection: check for duplicate phase numbering
MATCH_COUNT=0
for state in active pending completed; do
  MATCH_COUNT=$((MATCH_COUNT + $(find .planning/phases/${state} -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | wc -l)))
done
MATCH_COUNT=$((MATCH_COUNT + $(find .planning/phases -maxdepth 1 -type d -name "${PADDED}-*" 2>/dev/null | wc -l)))

if [ "$MATCH_COUNT" -gt 1 ]; then
  echo "COLLISION: ${MATCH_COUNT} directories match prefix '${PADDED}-*'"
  echo "Run /kata-migrate-phases to fix duplicate phase numbering before executing."
  exit 3
fi

if [ -z "$PHASE_DIR" ]; then
  echo "ERROR: No phase directory matching '${PHASE_ARG}'"
  exit 1
fi

PLAN_COUNT=$(find "$PHASE_DIR" -maxdepth 1 -name "*-PLAN.md" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PLAN_COUNT" -eq 0 ]; then
  echo "ERROR: No plans found in $PHASE_DIR"
  exit 2
fi

echo "PHASE_DIR=$PHASE_DIR"
echo "PLAN_COUNT=$PLAN_COUNT"
echo "PHASE_STATE=$PHASE_STATE"
