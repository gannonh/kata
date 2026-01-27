---
name: kata:complete-milestone
description: Archive completed milestone and prepare for next version
argument-hint: <version>
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
`Skill("kata-completing-milestones")`
