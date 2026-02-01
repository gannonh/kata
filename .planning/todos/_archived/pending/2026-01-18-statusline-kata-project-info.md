---
created: 2026-01-18T12:49
title: Add kata project info to statusline
area: ui
files:
  - TBD
---

## Problem

The statusline should display kata-specific project information to give users at-a-glance context about where they are in the workflow. This helps users understand their current position without needing to run separate commands.

Useful information to display:
- Current version (e.g., v0.1.4)
- Current milestone
- Current phase (e.g., Phase 04-02)
- Current plan status
- Suggested next command (e.g., `/kata:phase-verify`)

Example format: `v0.1.4 | Phase 04-02 | /kata:phase-verify`

## Solution

TBD - Need to:
1. Identify where statusline is configured/rendered
2. Determine how to access STATE.md and PROJECT.md data
3. Design concise format that fits in statusline space
4. Handle cases where project isn't initialized or data is missing
