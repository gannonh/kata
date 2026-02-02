---
created: 2026-02-02T04:56
title: Add issue type selection to add-issue skill
area: tooling
provenance: github:gannonh/kata-orchestrator#80
files:
  - skills/add-issue/SKILL.md
---

## Problem

The `/kata:add-issue` skill currently asks a generic question when the user wants to add an issue. Users should be prompted to select an issue type upfront so issues are properly categorized from creation.

## Solution

Update the skill's `extract_content` step to use AskUserQuestion with issue type options:

- Feature — New capability to add
- Enhancement — Improvement to existing functionality
- Bug — Something isn't working as expected
- Tech Debt — Code cleanup or refactoring needed
- Other — Custom type

Store the selected type in frontmatter (e.g., `type: feature`).
