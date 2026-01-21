---
name: kata:quick
description: Execute a quick task with atomic commit, skipping research/verification
argument-hint: "<task-description>"
disable-model-invocation: true
---

# Quick Task Command

Execute the kata-executing-quick-tasks skill.

**Context:** Pass $ARGUMENTS as task description. If no task provided, use AskUserQuestion to gather task details.
