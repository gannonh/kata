---
created: 2026-01-20T18:16:27Z
title: Project documentation templates and lifecycle
area: docs
type: feature
files:
  - kata/templates/
  - skills/kata-starting-new-projects/
  - skills/kata-manageing-milestones/
---

## Problem

New projects don't automatically get README.md and CHANGELOG.md files. Documentation exists as an afterthought rather than being integrated into the Kata workflow.

## Solution

1. **New project onboarding:**
   - Create README.md using template with project name, description, tech stack
   - Create CHANGELOG.md with initial "Unreleased" section
   - Templates in `kata/templates/README.template.md` and `kata/templates/CHANGELOG.template.md`

2. **Milestone completion:**
   - Update CHANGELOG.md with milestone summary
   - Move "Unreleased" items to versioned section
   - Update README.md if project scope/features changed

3. **PR merge process:**
   - Remind user to update CHANGELOG if significant changes
   - Auto-append to "Unreleased" section when appropriate
