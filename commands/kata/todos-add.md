---
name: kata:todos-add
description: Capture idea or task as todo from current conversation context
argument-hint: [optional description]
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
`Skill("kata-adding-todos")`
