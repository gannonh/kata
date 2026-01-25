---
name: kata:phase-verify
description: Validate built features through conversational UAT
argument-hint: [phase number, e.g., '4']
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
`Skill("kata-verifying-work")`
