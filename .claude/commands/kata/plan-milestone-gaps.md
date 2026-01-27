---
name: kata:plan-milestone-gaps
description: Create phases to close all gaps identified by milestone audit
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
`Skill("kata-planning-milestone-gaps")`
