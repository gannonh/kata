#!/usr/bin/env bash
# Source this at the top of any script that needs project-relative paths.
# After sourcing, CWD is the project root (directory containing .planning/).
#
# Detection priority:
#   1. KATA_PROJECT_ROOT env var (explicit override)
#   2. CWD contains .planning/
#   3. CWD/workspace contains .planning/ (bare repo root, prefer workspace over main)
#   4. CWD/main contains .planning/ (bare repo root, legacy fallback)
#   5. Error with instructions

if [ -n "${KATA_PROJECT_ROOT:-}" ] && [ -d "${KATA_PROJECT_ROOT}/.planning" ]; then
  cd "$KATA_PROJECT_ROOT"
elif [ -d ".planning" ]; then
  : # Already at project root
elif [ -d "workspace/.planning" ]; then
  cd workspace
elif [ -d "main/.planning" ]; then
  cd main
else
  echo "ERROR: Cannot find project root (.planning/ directory)." >&2
  echo "Set KATA_PROJECT_ROOT or run from the project directory." >&2
  exit 1
fi
