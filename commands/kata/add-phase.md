---
name: add-phase
description: Add phase to end of current milestone in roadmap
version: 0.1.0
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

<objective>
Add a new integer phase to the end of the current milestone in the roadmap.

This command appends sequential phases to the current milestone's phase list, automatically calculating the next phase number based on existing phases.

Purpose: Add planned work discovered during execution that belongs at the end of current milestone.
</objective>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the phase description
- Example: `/kata:add-phase Add authentication` → description = "Add authentication"
- Example: `/kata:add-phase Fix critical performance issues` → description = "Fix critical performance issues"

If no arguments provided, ask the user for a phase description:
</step>

<step name="run_skill">
Run the following skill to add the phase:
Skill("kata-adding-phases")
</step>