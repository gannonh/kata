---
name: kata:milestone-audit
description: Audit milestone completion against original intent before archiving
argument-hint: [version]
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
`Skill("kata-auditing-milestones")`
