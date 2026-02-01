---
created: 2026-01-28T12:08
title: Extract inline scripts from Markdown to standalone files
area: tooling
files:
  - skills/*/SKILL.md
  - agents/*.md
---

## Problem

Some Markdown files (skills, agents) contain inline bash or Python scripts embedded in code blocks. This makes the scripts:
1. Harder to test independently
2. Harder to maintain (no syntax highlighting in editors)
3. Mixed with prose, increasing cognitive load
4. Not reusable across multiple skills/agents

## Solution

Analyze the codebase to identify inline scripts that should be extracted:
1. Scan skills/*/SKILL.md and agents/*.md for code blocks with executable content
2. Identify scripts that are substantial enough to warrant extraction (e.g., >10 lines)
3. Extract to `scripts/` subdirectory within each skill directory
4. Update Markdown files to reference the external scripts
5. Follow Agent Skills spec pattern: `scripts/` contains executable code agents can run
