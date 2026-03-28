---
version: 1
workflow:
  mode: linear
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
skill_discovery: suggest
auto_supervisor: {}
symphony: {}
---

# Kata Preferences

> **Agent: do NOT overwrite this file.** Use `edit` to change individual fields. This file contains many settings — overwriting it with only the fields you care about destroys the rest.

See `~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md` for full field documentation and examples.

## Quick start

- `workflow.mode` is Linear-only. Keep `workflow.mode: linear`.
- Fill in the `linear` block to bind this project to a Linear team/project.
- Keep secrets like `LINEAR_API_KEY` in environment variables, not in this file.
- Set `pr.enabled: true` to activate the PR lifecycle (create, review, address, merge via `gh` CLI).

## Models example

```yaml
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6     # Opus for architectural decisions
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
  review: claude-sonnet-4-6     # Model for PR reviewer subagents
```

Omit any key to use the currently selected model.

## PR lifecycle example

```yaml
pr:
  enabled: true
  auto_create: true      # auto-create PR after slice completes in auto-mode
  base_branch: main      # target branch for PRs
  review_on_create: false # auto-run parallel review after PR is created
  linear_link: false      # add Linear issue references to PR body (requires linear mode)
```

## Symphony example

```yaml
symphony:
  url: http://localhost:8080  # Symphony server URL (or set KATA_SYMPHONY_URL env var)
```

## Linear example

```yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: 459f9835e809   # from your Linear project URL (or use projectId for UUID)
```
