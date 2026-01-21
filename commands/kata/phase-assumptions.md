---
name: kata:phase-assumptions
description: List and validate assumptions for a phase before planning
argument-hint: "<phase-number>"
disable-model-invocation: true
---

# Phase Assumptions Command

Analyzes and presents Claude's assumptions about a phase for user validation.

## Execution

Execute the kata-researching-phases skill with mode="assumptions".

Pass $ARGUMENTS as phase number. If no phase provided, use AskUserQuestion to select phase.

Conversational analysis - no file output. Presents assumptions across:
- Technical approach
- Implementation order
- Scope boundaries
- Risk areas
- Dependencies
