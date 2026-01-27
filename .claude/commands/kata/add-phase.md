---
name: kata:add-phase
description: Add phase to end of current milestone in roadmap
version: 0.1.0
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Parse Context

Phase Description: "$ARGUMENTS"

## Step 2: Invoke Skill

Run the following skill to add the phase:
`Skill("kata-adding-phases")`