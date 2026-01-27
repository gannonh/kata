---
name: kata:new-milestone
description: Start a new milestone cycle — update PROJECT.md and route to requirements
argument-hint: [milestone name, e.g., 'v1.1 Notifications']
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
`Skill("kata-starting-milestones")`
