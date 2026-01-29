---
created: 2026-01-18T17:27
title: Add model configuration options for workflows
area: planning
files:
  - commands/kata/*.md
  - agents/kata-*.md
---

## Problem

Currently there's no way to configure which models Kata workflows use. Users may want:
- Cost optimization (all Sonnet)
- Maximum quality (all Opus)
- Balanced approach (mix based on task complexity)

Different workflows have different cognitive demands - research and planning benefit from Opus, while execution may be fine with Sonnet.

## Solution

Add model configuration option with three presets:

1. **All Sonnet** - Budget-friendly, faster
2. **All Opus** - Maximum quality for all tasks
3. **Mix (Recommended)** - Kata decides per workflow:
   - Research agents → Opus (need deep reasoning)
   - Planning agents → Opus (architectural decisions)
   - Execution agents → Sonnet (following clear plans)
   - Verification agents → Opus (judgment calls)

Configuration could live in:
- PROJECT.md frontmatter
- `.planning/config.yml`
- Per-command override via argument
