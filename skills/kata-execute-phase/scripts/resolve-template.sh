#!/usr/bin/env bash
# Usage: resolve-template.sh <template-name>
# Returns: absolute path to the resolved template file (stdout)
# Resolution: .planning/templates/{name}.md -> sibling skill references
# Exit: 0=found, 1=not found
set -euo pipefail

TEMPLATE_NAME="${1:?Usage: resolve-template.sh <template-name>}"

# Check project override first
PROJECT_TEMPLATE=".planning/templates/${TEMPLATE_NAME}"
if [ -f "$PROJECT_TEMPLATE" ]; then
  echo "$(pwd)/${PROJECT_TEMPLATE}"
  exit 0
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
