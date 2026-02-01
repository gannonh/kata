---
created: 2026-01-20T18:16:27Z
title: Add-on extensions for progressive disclosure files
area: tooling
type: feature
files:
  - skills/kata-managing-project-roadmap/references/
  - .planning/config.json
---

## Problem

Skills use progressive disclosure via `references/` subdirectories. Currently no way to have platform-specific or context-specific extensions that augment the base reference files.

For example, a GitHub-focused extension to `phase-operations.md` would need to be manually maintained separately rather than auto-loading alongside the base file.

## Solution

1. **Naming convention:** `{filename}.ext.{extension-name}.md`
   - Example: `phase-operations.ext.github.md` runs alongside `phase-operations.md`
   - Extensions augment but don't replace base files

2. **Project init integration:**
   - During new project onboarding, user selects which extensions to enable
   - Selection saved to `.planning/config.json` under an `extensions` key
   - Skills check config and load matching `.ext.{name}.md` files

3. **Extension discovery:**
   - Skills scan `references/` for `.ext.*.md` pattern
   - Only load extensions matching enabled config
