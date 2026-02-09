#!/usr/bin/env bash
# Usage: resolve-template.sh <template-name>
# Returns: absolute path to the resolved template file (stdout)
# Resolution: .planning/templates/{name}.md -> sibling skill references
# Exit: 0=found, 1=not found
set -euo pipefail

TEMPLATE_NAME="${1:?Usage: resolve-template.sh <template-name>}"

# Find project root by looking for .planning/ directory
# Start from current directory and walk up until we find it
CURRENT_DIR="$(pwd)"
while [ "$CURRENT_DIR" != "/" ]; do
  if [ -d "$CURRENT_DIR/.planning" ]; then
    PROJECT_ROOT="$CURRENT_DIR"
    break
  fi
  CURRENT_DIR="$(dirname "$CURRENT_DIR")"
done

# Check project override first (if we found project root)
if [ -n "$PROJECT_ROOT" ]; then
  PROJECT_TEMPLATE="${PROJECT_ROOT}/.planning/templates/${TEMPLATE_NAME}"
  if [ -f "$PROJECT_TEMPLATE" ]; then
    echo "$PROJECT_TEMPLATE"
    exit 0
  fi
fi

# Fall back to sibling skill discovery
# Script is at skills/kata-execute-phase/scripts/resolve-template.sh
# Two levels up (scripts/ -> kata-execute-phase/ -> skills/) reaches the skills directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

for f in "${SKILLS_DIR}"/kata-*/references/${TEMPLATE_NAME}; do
  if [ -f "$f" ]; then
    echo "$f"
    exit 0
  fi
done

# Template not found - provide actionable error
echo "ERROR: Template not found: ${TEMPLATE_NAME}" >&2
echo "  Searched:" >&2
echo "    $(pwd)/.planning/templates/${TEMPLATE_NAME} (project override)" >&2
echo "    ${SKILLS_DIR}/kata-*/references/${TEMPLATE_NAME} (sibling skills)" >&2
exit 1
