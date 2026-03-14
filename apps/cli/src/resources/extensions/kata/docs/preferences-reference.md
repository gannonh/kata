# Kata Preferences Reference

Full documentation for `~/.kata-cli/preferences.md` (global) and `.kata/preferences.md` (project).

---

## Notes

- These preferences guide how Kata should route work and load skills.
- Project preferences live at `.kata/preferences.md`.
- Kata still reads the legacy `.kata/PREFERENCES.md` filename for backward compatibility, but new projects should use the lowercase canonical path.
- Secrets stay in environment variables (`LINEAR_API_KEY`, provider keys, tokens). Do not store secrets in preferences files.

---

## Field Guide

- `version`: schema version. Start at `1`.

- `workflow`: workflow-mode configuration.
  - `workflow.mode`: `file` or `linear`.
    - `file` keeps Kata's existing file-backed milestone/slice/task workflow.
    - `linear` opts the project into the Linear-backed workflow slices in M002.

- `linear`: Linear binding configuration used when `workflow.mode: linear`.
  - `linear.teamId`: optional Linear team UUID.
  - `linear.teamKey`: optional Linear team key such as `KAT`.
  - `linear.projectId`: optional Linear project UUID.
  - These fields identify which Linear team/project Kata should validate and operate against.

- `pr`: PR lifecycle configuration. Controls whether and how Kata manages GitHub pull requests.
  - `pr.enabled`: set to `true` to activate the PR lifecycle. Requires `gh` CLI installed and authenticated.
  - `pr.auto_create`: set to `true` to automatically open a PR after each slice completes in auto-mode. Only takes effect when `pr.enabled` is true.
  - `pr.base_branch`: target branch for PRs (default: `main`).
  - `pr.review_on_create`: set to `true` to automatically run the parallel reviewer subagents immediately after a PR is created.
  - `pr.linear_link`: set to `true` to include Linear issue references (`Closes KAT-N`) in PR bodies and update Linear issues on merge. Requires `workflow.mode: linear`. **Pending — will be activated in M003/S06.**

- `always_use_skills`: skills Kata should use whenever they are relevant.

- `prefer_skills`: soft defaults Kata should prefer when relevant.

- `avoid_skills`: skills Kata should avoid unless clearly needed.

- `skill_rules`: situational rules with a human-readable `when` trigger and one or more of `use`, `prefer`, or `avoid`.

- `custom_instructions`: extra durable instructions related to skill use.

- `models`: per-stage model selection for auto-mode. Keys: `research`, `planning`, `execution`, `completion`. Values: model IDs (for example `claude-sonnet-4-6`, `claude-opus-4-6`). Omit a key to use whatever model is currently active.

- `skill_discovery`: controls how Kata discovers and applies skills during auto-mode. Valid values:
  - `auto` — skills are found and applied automatically without prompting.
  - `suggest` — (default) skills are identified during research but not installed automatically.
  - `off` — skill discovery is disabled entirely.

- `auto_supervisor`: configures the auto-mode supervisor that monitors agent progress and enforces timeouts. Keys:
  - `model`: model ID to use for the supervisor process (defaults to the currently active model).
  - `soft_timeout_minutes`: minutes before the supervisor issues a soft warning (default: 20).
  - `idle_timeout_minutes`: minutes of inactivity before the supervisor intervenes (default: 10).
  - `hard_timeout_minutes`: minutes before the supervisor forces termination (default: 30).

---

## Inspecting Active Mode

Run `/kata prefs status` to see the active workflow mode, which preferences file is currently winning, and whether a Linear binding is ready.

Typical file-mode output:

```text
Kata prefs status
mode: file
effective preferences: /path/to/project/.kata/preferences.md (project)
linear: inactive (file mode)
```

Typical Linear-mode output:

```text
Kata prefs status
mode: linear
LINEAR_API_KEY: present
linear.teamKey: KAT
linear.projectId: 12345678-1234-1234-1234-1234567890ab
validation: valid
resolved team: Kata-sh (KAT · a47bcacd-54f3-4472-a4b4-d6933248b605)
```

If Linear mode is configured but not ready, the status output stays redacted and actionable — for example `LINEAR_API_KEY: missing`, `diagnostic: missing_linear_team`, or `diagnostic: invalid_linear_project`.

Run `/kata pr status` to inspect the PR lifecycle configuration:

```text
PR lifecycle: enabled
branch: kata/M003/S05
base_branch: main
auto_create: true
open PR: #70 — kata/M003/S05
```

When PR lifecycle is disabled or not configured:

```text
PR lifecycle: pr.enabled is false (disabled)
branch: kata/M003/S05
Set pr.enabled: true in .kata/preferences.md to activate the PR workflow.
```

## Best Practices

- Keep `always_use_skills` short.
- Use `skill_rules` for situational routing, not broad personality preferences.
- Prefer skill names for stable built-in skills.
- Prefer absolute paths for local personal skills.
- Use `linear.teamKey` when you want a readable binding; use `linear.teamId` when you already have the UUID.
- Keep auth in env vars and config in preferences.

---

## File-mode example

```yaml
---
version: 1
workflow:
  mode: file
prefer_skills:
  - verification-before-completion
---
```

## Linear-mode example

```yaml
---
version: 1
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectId: 12345678-1234-1234-1234-1234567890ab
prefer_skills:
  - linear
custom_instructions:
  - "Treat Linear as the workflow source of truth for planning and status"
---
```

This opts the project into Linear mode without storing `LINEAR_API_KEY` in the preferences file.

## PR lifecycle example

```yaml
---
version: 1
workflow:
  mode: file
pr:
  enabled: true
  auto_create: true
  base_branch: main
  review_on_create: false
  linear_link: false
---
```

Set `auto_create: true` for fully automated PR creation after each slice in auto-mode. Set `review_on_create: true` to chain into a parallel review immediately after creation.
