---
name: kata:list-assumptions
description: Surface Claude's assumptions about a phase approach before planning
argument-hint: [phase]
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
`Skill("kata-listing-phase-assumptions")`
