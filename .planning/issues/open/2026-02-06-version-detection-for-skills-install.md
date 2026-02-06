---
created: 2026-02-06T20:45
title: Version detection incorrect for skills-based installations
area: tooling
provenance: github:gannonh/kata-orchestrator#112
files:
  - skills/kata-help/SKILL.md
  - .claude-plugin/plugin.json
---

## Problem

When Kata is installed via `npx skills add gannonh/kata-skills`, the `/kata-help` skill reports the wrong version. It reads `.claude-plugin/plugin.json` from a previously installed plugin copy on disk, which may be stale (e.g., shows 1.5.0 when current is 1.6.1).

This affects:
- Skills-only installations (no plugin present, or stale plugin copy)
- Dual installations (plugin + skills, versions may diverge)

The root cause is that version detection assumes plugin distribution. Skills-based installs don't have a `.claude-plugin/plugin.json` at a predictable path, and even if one exists it may not match the installed skills version.

## Solution

TBD. Options to explore:
- Embed a VERSION file in the skills distribution root
- Have each skill carry its own version in SKILL.md frontmatter
- Fall back to reading VERSION from the skill's own directory tree
- Accept "unknown" version for skills-based installs and display install method
