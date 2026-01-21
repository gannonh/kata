---
name: kata:phase-remove
description: Remove a future phase from the roadmap (cannot remove completed phases)
argument-hint: "<phase-number>"
disable-model-invocation: true
---

# Remove Phase Command

Removes an unstarted future phase and renumbers subsequent phases.

## Execution

Execute the kata-managing-project-roadmap skill with operation="remove".

Pass $ARGUMENTS as phase number to remove.

If no phase number provided, use AskUserQuestion to gather target phase.

User must confirm removal before execution.
