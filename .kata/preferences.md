---
version: 1
workflow:
  mode: github
github:
  repoOwner: gannonh
  repoName: kata
  stateMode: projects_v2
  githubProjectNumber: 17
symphony:
  url: http://localhost:8080
  workflow_path: apps/symphony/WORKFLOW.md
---

# Kata Preferences

This workspace uses the Phase A Kata CLI skill platform with GitHub Projects v2 as the durable backend.

## Active fields

- `workflow.mode`: selects the workflow backend. This repo uses `github`.
- `github.repoOwner` and `github.repoName`: identify the GitHub repository.
- `github.stateMode`: must be `projects_v2`.
- `github.githubProjectNumber`: GitHub Projects v2 project number.
- `symphony.url`: Symphony dashboard URL used by Desktop.
- `symphony.workflow_path`: workflow file used when Desktop launches Symphony.

## Secrets

Keep credentials out of this file. Use environment variables such as `GH_TOKEN` or `GITHUB_TOKEN`.
