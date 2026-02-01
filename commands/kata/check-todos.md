---
name: kata:check-todos
description: "[DEPRECATED] Use /kata:check-issues instead. List open issues."
argument-hint: [area filter]
version: 0.2.0
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Deprecation Notice

> **Note:** `/kata:check-todos` is now `/kata:check-issues`. Redirecting...

## Step 2: Parse Context

Arguments: "$ARGUMENTS"

## Step 3: Invoke Skill

Run the following skill:
`Skill("kata:checking-issues")`
