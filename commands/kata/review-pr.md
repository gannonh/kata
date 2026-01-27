---
name: kata:review-pr
description: Comprehensive PR review using specialized agents
argument-hint: "[aspects...] [--staged|--pr|--branch <ref>]"
version: 0.1.0
disable-model-invocation: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

## Step 1: Parse Context

Arguments: "$ARGUMENTS"

## Step 2: Invoke Skill

Run the following skill:
`Skill("kata-reviewing-prs")`
