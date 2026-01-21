---
name: kata:phase-research
description: Research phase domain, explore technical approaches, gather implementation context
argument-hint: "<phase-number>"
disable-model-invocation: true
---

# Phase Research Command

Researches phase domain and creates RESEARCH.md with technical findings.

## Execution

Execute the kata-researching-phases skill with mode="research".

Pass $ARGUMENTS as phase number. If no phase provided, use AskUserQuestion to select phase.

Spawns kata-phase-researcher subagent for investigation.
