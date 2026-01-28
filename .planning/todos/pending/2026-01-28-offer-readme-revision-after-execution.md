---
created: 2026-01-28T15:08
title: Offer README revision after execution phase
area: planning
files:
  - skills/executing-phases/SKILL.md
  - agents/kata-executor.md
---

## Problem

After completing an execution phase, the README may need updates to reflect new features, changed APIs, or updated usage instructions. Currently there's no prompt to consider this, so documentation drift accumulates.

## Solution

At the end of the executing-phases workflow (after verification):
1. Prompt user: "Would you like to review/update the README to reflect this phase's changes?"
2. If yes, analyze what was built and suggest specific README sections that may need updates
3. Offer to make the changes or let user handle manually
4. Keep it optional — don't block completion on README updates
