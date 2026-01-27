---
name: kata:plan-phase
description: Create detailed execution plan for a phase (PLAN.md) with verification loop
argument-hint: [phase] [--research] [--skip-research] [--gaps] [--skip-verify]
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
`Skill("kata-planning-phases")`
