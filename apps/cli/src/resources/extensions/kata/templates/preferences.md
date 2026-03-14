---
version: 1
workflow:
  mode: file
linear: {}
pr:
  enabled: false
  auto_create: false
  base_branch: main
  review_on_create: false
  linear_link: false
always_use_skills: []
prefer_skills: []
avoid_skills: []
skill_rules: []
custom_instructions: []
models: {}
skill_discovery:
auto_supervisor: {}
---

# Kata Preferences

> **Agent: do NOT overwrite this file.** Use `edit` to change individual fields. This file contains many settings — overwriting it with only the fields you care about destroys the rest.

See `~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md` for full field documentation and examples.

## Quick start

- Leave `workflow.mode: file` for the default file-backed Kata workflow.
- Set `workflow.mode: linear` and fill in the `linear` block to opt this project into Linear-backed workflow mode.
- Keep secrets like `LINEAR_API_KEY` in environment variables, not in this file.
- Set `pr.enabled: true` to activate the PR lifecycle (create, review, address, merge via `gh` CLI).

## PR lifecycle example

```yaml
pr:
  enabled: true
  auto_create: true      # auto-create PR after slice completes in auto-mode
  base_branch: main      # target branch for PRs
  review_on_create: false # auto-run parallel review after PR is created
  linear_link: false      # add Linear issue references to PR body (requires linear mode)
```

## Linear example

```yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectId: 12345678-1234-1234-1234-1234567890ab
```
