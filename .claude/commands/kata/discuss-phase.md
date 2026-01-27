---
name: kata:discuss-phase
description: Gather phase context through adaptive questioning before planning
argument-hint: <phase>
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
`Skill("kata-discussing-phases")`
