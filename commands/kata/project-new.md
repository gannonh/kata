---
name: kata:project-new
description: Initialize a new project with deep context gathering and PROJECT.md
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
`Skill("kata-starting-projects")`
