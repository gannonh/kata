---
name: kata:phase-add
description: Add a new phase to the end of the current milestone roadmap
argument-hint: "<phase-name>"
disable-model-invocation: true
---

# Add Phase Command

Adds a new integer phase to the end of the current milestone.

## Execution

Execute the kata-managing-project-roadmap skill with operation="add".

Pass $ARGUMENTS as phase name. If no phase name provided, use AskUserQuestion to gather phase description.
