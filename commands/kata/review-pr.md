---
name: kata:review-pr
description: Run a comprehensive pull request review using multiple specialized agents
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
`Skill("kata-reviewing-pull-requests")`
