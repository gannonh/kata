---
name: kata:debug-issue
description: Systematic debugging with persistent state across context resets
argument-hint: [issue description]
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
`Skill("kata-debugging")`
