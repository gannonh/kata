#!/usr/bin/env bash
# Usage: resolve-template.sh <template-name>
# Returns: absolute path to the resolved template file (stdout)
# Resolution: .planning/templates/{name}.md -> plugin default
# Exit: 0=found, 1=not found
set -euo pipefail

TEMPLATE_NAME="${1:?Usage: resolve-template.sh <template-name>}"

# Check project override first
PROJECT_TEMPLATE=".planning/templates/${TEMPLATE_NAME}"
if [ -f "$PROJECT_TEMPLATE" ]; then
  echo "$(pwd)/${PROJECT_TEMPLATE}"
  exit 0
fi

# Fall back to plugin default
# Plugin root from environment, or discover from script location
# Script is at skills/kata-execute-phase/scripts/resolve-template.sh
# So ../../.. reaches the plugin root
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../../.." && pwd)}"

# Glob across all skills for the template
for f in "${PLUGIN_ROOT}"/skills/kata-*/references/${TEMPLATE_NAME}; do
  if [ -f "$f" ]; then
    echo "$f"
    exit 0
  fi
done

echo "ERROR: Template not found: ${TEMPLATE_NAME}" >&2
exit 1
