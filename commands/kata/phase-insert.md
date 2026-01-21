---
name: kata:phase-insert
description: Insert an urgent phase between existing phases using decimal numbering
argument-hint: "<after-phase> <phase-name>"
disable-model-invocation: true
---

# Insert Phase Command

Inserts a decimal phase for urgent work between existing integer phases.

## Execution

Execute the kata-managing-project-roadmap skill with operation="insert".

Parse $ARGUMENTS for position and name. Example: "2 hotfix" inserts Phase 2.1: hotfix after Phase 2.

If insufficient arguments provided, use AskUserQuestion to gather:
1. After which phase to insert
2. Phase description
