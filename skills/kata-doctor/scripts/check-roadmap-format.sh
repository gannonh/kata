#!/bin/bash
# Check ROADMAP.md format version
# Exit codes:
#   0 = current format (has required sections)
#   1 = old format (needs migration)
#   2 = no ROADMAP.md (skip check)

ROADMAP=".planning/ROADMAP.md"

# Exit 2 if no roadmap exists
[ ! -f "$ROADMAP" ] && exit 2

# Current format requires BOTH:
# 1. "## Milestones" section
# 2. Either "## Current Milestone:" OR "## Completed Milestones" OR "<details>" block

HAS_MILESTONES_SECTION=$(grep -E "^## Milestones" "$ROADMAP" 2>/dev/null)
HAS_CURRENT_OR_COMPLETED=$(grep -E "^## Current Milestone:|^## Completed Milestones|<details>" "$ROADMAP" 2>/dev/null)

if [ -n "$HAS_MILESTONES_SECTION" ] && [ -n "$HAS_CURRENT_OR_COMPLETED" ]; then
  # Current format detected
  exit 0
else
  # Old format - needs migration
  exit 1
fi
