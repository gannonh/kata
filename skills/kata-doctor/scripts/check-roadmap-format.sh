#!/bin/bash
# Check ROADMAP.md format version against canonical structure
# Exit codes:
#   0 = current format (has all required sections)
#   1 = old format (needs migration)
#   2 = no ROADMAP.md (skip check)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../../kata-configure-settings/scripts/project-root.sh"

ROADMAP=".planning/ROADMAP.md"

# Exit 2 if no roadmap exists
[ ! -f "$ROADMAP" ] && exit 2

# Canonical format requires ALL of:
# 1. "## Milestones" section (overview list with ✅/🔄/○ symbols)
# 2. "## Current Milestone:" heading (either "v[X.Y] [Name]" or "None")
# 3. Either "## Completed Milestones" section OR no completed work yet

HAS_MILESTONES=$(grep -E "^## Milestones" "$ROADMAP" 2>/dev/null)
HAS_CURRENT_MILESTONE=$(grep -E "^## Current Milestone:" "$ROADMAP" 2>/dev/null)

# Check for completed milestones section OR verify it's a new project
# (new projects won't have completed milestones yet, which is OK)
HAS_COMPLETED_SECTION=$(grep -E "^## Completed Milestones" "$ROADMAP" 2>/dev/null)
HAS_DETAILS_BLOCK=$(grep -E "^<details>" "$ROADMAP" 2>/dev/null)

# Old format indicators (should NOT be present in canonical format):
# - "## Phases" as a top-level section (old format uses this instead of Current Milestone)
# - Phase headings directly at root (### Phase N:) without being under a milestone
HAS_OLD_PHASES_SECTION=$(grep -E "^## Phases$" "$ROADMAP" 2>/dev/null)

# Canonical format check:
# MUST have: ## Milestones AND ## Current Milestone:
# MUST NOT have: ## Phases (old format indicator)
if [ -n "$HAS_MILESTONES" ] && [ -n "$HAS_CURRENT_MILESTONE" ] && [ -z "$HAS_OLD_PHASES_SECTION" ]; then
  # Current format detected
  exit 0
else
  # Old format - needs migration
  exit 1
fi
