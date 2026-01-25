---
name: kata:project-status
description: Check project progress, show context, and route to next action (execute or plan)
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
`Skill("kata-tracking-progress")`
