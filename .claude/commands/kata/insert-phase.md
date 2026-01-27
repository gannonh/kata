---
name: kata:insert-phase
description: Insert urgent work as decimal phase (e.g., 72.1) between existing phases
argument-hint: <after> <description>
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
`Skill("kata-inserting-phases")`
