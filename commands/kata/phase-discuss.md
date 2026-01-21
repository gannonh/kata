---
name: kata:phase-discuss
description: Gather implementation context through adaptive questioning before planning
argument-hint: "<phase-number>"
disable-model-invocation: true
---

# Phase Discussion Command

Gathers implementation context through adaptive questioning, producing CONTEXT.md for downstream agents.

## Execution

Execute the kata-discussing-phase-context skill.

Pass $ARGUMENTS as phase number. If no phase provided, use AskUserQuestion to select phase.

Creates {phase}-CONTEXT.md with user's implementation decisions.
