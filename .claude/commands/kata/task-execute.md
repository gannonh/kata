---
name: kata:task-execute
description: Execute a quick task with Kata guarantees (atomic commits, state tracking) but skip optional agents
argument-hint: <description>
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
`Skill("kata-executing-task-executes")`
