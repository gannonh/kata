---
created: 2026-02-02T10:45
title: Milestone completion should offer to do release tasks
area: ui
provenance: github:gannonh/kata-orchestrator#83
files:
  - skills/complete-milestone/SKILL.md
---

## Problem

When completing a milestone via `/kata:complete-milestone`, the agent currently asks if the user has updated the changelog and bumped the release version. This puts the burden on the user to do these tasks manually.

The current UX shows:
- "Have you updated CHANGELOG.md and package.json for v1.0?"
- Options: "Yes, continue" / "No, let me update them"

This is backwards - the agent should offer to perform these tasks for the user, not ask if the user has done them.

## Solution

Update the milestone completion skill to:
1. Offer to update CHANGELOG.md with milestone changes
2. Offer to bump version in package.json
3. Then proceed with milestone completion

Suggested flow:
- "I can update the release artifacts for v1.0. Would you like me to:"
  - "Update CHANGELOG.md and bump version (Recommended)"
  - "Just bump version"
  - "Skip - I'll handle it manually"
