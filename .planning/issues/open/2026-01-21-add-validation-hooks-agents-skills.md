---
created: 2026-01-21T04:12
title: Add validation hooks to agents and skills
area: tooling
files:
  - agents/kata-*.md
  - skills/kata-*/SKILL.md
  - hooks/
---

## Problem

Agents and skills currently lack validation mechanisms to ensure they're being used correctly and producing expected outputs. This can lead to:
- Agents spawned with incorrect parameters or context
- Skills that complete but don't meet quality criteria
- Silent failures or degraded output quality
- Difficulty debugging when workflows don't work as expected

## Solution

Add validation hooks that check:

1. **Pre-execution validation** (before agent/skill runs):
   - Required context files exist and are readable
   - Input parameters are well-formed
   - Dependencies are available (commands, tools, files)

2. **Post-execution validation** (after agent/skill completes):
   - Expected output files were created
   - Output files have required structure (frontmatter, sections)
   - Quality metrics met (file size, completeness indicators)
   - No obvious errors or malformed content

3. **Hook implementation**:
   - PreToolUse hook to validate Task tool calls for agent spawning
   - PostToolUse hook to check agent output quality
   - Integration with existing error handling in orchestrators

This would surface issues early and make debugging much faster.
