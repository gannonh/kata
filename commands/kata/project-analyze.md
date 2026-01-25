---
name: kata:project-analyze
description: Analyze codebase with parallel mapper agents to produce .planning/codebase/ documents
argument-hint: [optional: specific area to map, e.g., 'api' or 'auth']
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
`Skill("kata-mapping-codebases")`
