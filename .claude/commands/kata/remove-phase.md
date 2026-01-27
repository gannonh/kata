---
name: kata:remove-phase
description: Remove a future phase from roadmap and renumber subsequent phases
argument-hint: <phase-number>
version: 0.1.0
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Parse Context

Arguments: "$ARGUMENTS"

## Step 2: Invoke Skill

Run the following skill:
`Skill("kata-removing-phases")`
