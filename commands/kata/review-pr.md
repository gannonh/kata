---
name: kata:review-pr
description: Run a comprehensive pull request review using multiple specialized agents
version: 0.1.0
argument-hint: <description>
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Parse Context

Phase Description: "$ARGUMENTS"

## Step 2: Invoke Skill

Run the PR review skill:
`Skill("kata:reviewing-pull-requests")`

## Troubleshooting

- **"Not a git repository"**: Run this command from within a git repository
- **"No changes detected"**: Stage or commit changes before running review
- **"gh CLI not authenticated"**: Run `gh auth login` first for GitHub PR integration
- **"Agent timeout"**: Large PRs may timeout; try reviewing specific aspects with `/kata:review-pr errors`
