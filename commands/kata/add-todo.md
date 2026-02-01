---
name: kata:add-todo
description: "[DEPRECATED] Use /kata:add-issue instead. Capture idea or task as issue."
argument-hint: [optional description]
version: 0.2.0
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Deprecation Notice

> **Note:** `/kata:add-todo` is now `/kata:add-issue`. Redirecting...

## Step 2: Parse Context

Arguments: "$ARGUMENTS"

## Step 3: Invoke Skill

Run the following skill:
`Skill("kata:adding-issues")`
