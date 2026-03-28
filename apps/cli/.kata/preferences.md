---
version: 1
workflow:                                                                                                                                                        
    mode: linear                                                                                                                                                   
linear:                                                                                                                                                          
    teamKey: KAT                                                                                                                                                   
    projectSlug: 459f9835e809
pr:
  enabled: true
  auto_create: true
  base_branch: main
  review_on_create: false
  linear_link: true
always_use_skills: 
    - /Volumes/EVO/kata/kata-mono/.agents/skills/releasing-kata/SKILL.md
    - /Users/gannonhall/.agents/skills/pull-requests/SKILL.md
prefer_skills: []
avoid_skills: []
skill_rules: []
custom_instructions: []
models: 
    research: claude-sonnet-4-6
    planning: claude-opus-4-6
    execution: claude-opus-4-6
    completion: claude-sonnet-4-6
    review: claude-sonnet-4-6 
skill_discovery: auto
auto_supervisor: {}
symphony:
  url: http://localhost:8080
  workflow_path: ../symphony/WORKFLOW-cli.md
  console_position: below-output

---

# Kata Preferences

> **Agent: do NOT overwrite this file.** Use `edit` to change individual fields. This file contains many settings — overwstatyuriting it with only the fields you care about destroys the rest.

See `~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md` for full field documentation and examples.

## Quick start

- Leave `workflow.mode: file` for the default file-backed Kata workflow.
- Set `workflow.mode: linear` and fill in the `linear` block to opt this project into Linear-backed workflow mode.
- Keep secrets like `LINEAR_API_KEY` in environment variables, not in this file.
- Set `pr.enabled: true` to activate the PR lifecycle (create, review, address, merge via `gh` CLI).

## Models example

```yaml
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6     # Opus for architectural decisions
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
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

## Linear example

```yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectId: 12345678-1234-1234-1234-1234567890ab
```

<!-- codex models

models: 
    research: gpt-5.3-codex-spark
    planning: gpt-5.4
    execution: gpt-5.3-codex-spark
    completion: gpt-5.3-codex-spark

-->