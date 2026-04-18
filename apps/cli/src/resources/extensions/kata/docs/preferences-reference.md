# Kata Preferences Reference

Full documentation for `~/.kata-cli/preferences.md` (global) and `.kata/preferences.md` (project).

---

## Notes

- These preferences guide how Kata should route work and load skills.
- Project preferences live at `.kata/preferences.md`.
- Kata still reads the legacy `.kata/PREFERENCES.md` filename for backward compatibility, but new projects should use the lowercase canonical path.
- Do not store secrets in preferences files.
- Kata stores provider credentials in `~/.kata-cli/agent/auth.json` and hydrates runtime env vars like `LINEAR_API_KEY` automatically.
- Manually setting env vars is still supported, but `.env` is optional.

---

## Field Guide

- `version`: schema version. Start at `1`.

- `uat_dispatch`: boolean toggle for `/kata auto` UAT dispatch.
  - When `true`, auto-mode dispatches `run-uat` for a completed slice when `Sxx-UAT` exists and `Sxx-UAT-RESULT` is still missing.
  - For non-`artifact-driven` UAT types, auto-mode surfaces the result for human review and pauses.

- `budget_ceiling`: optional numeric spend cap for auto-mode.
  - When current tracked cost reaches/exceeds this value, auto-mode pauses and asks you to resume explicitly.

- `workflow`: workflow-mode configuration.
  - `workflow.mode`: `linear` (default) or `github`.
    - `linear` — Kata workflow state is Linear-backed (milestones, slices, tasks as Linear issues/milestones).
    - `github` — Kata workflow state is GitHub-backed (milestones, slices, tasks as GitHub issues). Requires a `github` block in `.kata/preferences.md` (see below).
    - File mode has been removed; file-backed `.kata/` workflow artifacts are no longer used.

- `linear`: Linear binding configuration. Required when `workflow.mode: linear`.
  - `linear.teamKey`: Linear team key such as `KAT`. Required.
  - `linear.projectSlug`: Linear project slug from the project URL (e.g. `459f9835e809`). Required.
  - `linear.teamId`: optional Linear team UUID (alternative to `teamKey`).

- `github`: GitHub tracker binding. Required when `workflow.mode: github`.
  - `github.repoOwner`: GitHub org or user owner (required).
  - `github.repoName`: GitHub repository name (required).
  - `github.stateMode`: `labels` (default) or `projects_v2`.
  - `github.githubProjectNumber`: positive integer project number (optional).
  - `github.labelPrefix`: issue label prefix for phase derivation (optional, default `kata:`).

- `pr`: PR lifecycle configuration. Controls whether and how Kata manages GitHub pull requests.
  - `pr.enabled`: set to `true` to activate the PR lifecycle. Requires `gh` CLI installed and authenticated.
  - `pr.auto_create`: set to `true` to automatically open a PR after each slice completes in auto-mode. Only takes effect when `pr.enabled` is true.
  - `pr.base_branch`: target branch for PRs (default: `main`).
  - `pr.review_on_create`: set to `true` to automatically run the parallel reviewer subagents immediately after a PR is created.
  - `pr.linear_link`: set to `true` to include Linear issue references (`Closes KAT-N`) in PR bodies and update Linear issues on merge. Requires `workflow.mode: linear`.

- `always_use_skills`: skills Kata should use whenever they are relevant.

- `prefer_skills`: soft defaults Kata should prefer when relevant.

- `avoid_skills`: skills Kata should avoid unless clearly needed.

- `skill_rules`: situational rules with a human-readable `when` trigger and one or more of `use`, `prefer`, or `avoid`.

- `custom_instructions`: extra durable instructions related to skill use.

- `models`: per-stage model selection for auto-mode, step mode, and PR review. Keys: `research`, `planning`, `execution`, `completion`, `review`. Values: model IDs (for example `claude-sonnet-4-6`, `claude-opus-4-6`). The `review` key controls which model PR reviewer subagents use (via `/kata pr review`). Applied in both `/kata auto` and `/kata step`. Omit a key to use whatever model is currently active.

- `skill_discovery`: controls how Kata discovers and applies skills during auto-mode. Valid values:
  - `auto` — skills are found and applied automatically without prompting.
  - `suggest` — (default) skills are identified during research but not installed automatically.
  - `off` — skill discovery is disabled entirely.

- `symphony`: Symphony orchestration server configuration.
  - `symphony.url`: base URL for the Symphony server (e.g. `http://localhost:8080`). Required for `/symphony` commands and `symphony_*` tools. Can also be set via `KATA_SYMPHONY_URL` or `SYMPHONY_URL` environment variables (`KATA_SYMPHONY_URL` takes precedence). The preferences field takes priority over environment variables.
  - `symphony.workflow_path`: absolute path to the Symphony WORKFLOW.md file. Used by `/symphony config` to locate the config file for editing. Falls back to `WORKFLOW.md` in cwd if not set.
  - `symphony.console_position`: placement of the `/symphony console` panel in the TUI. Values: `below-output` (default), `above-status`.

- `auto_supervisor`: configures the auto-mode supervisor that monitors agent progress and enforces timeouts. Keys:
  - `model`: model ID to use for the supervisor process (defaults to the currently active model).
  - `soft_timeout_minutes`: minutes before the supervisor issues a soft warning (default: 20).
  - `idle_timeout_minutes`: minutes of inactivity before the supervisor intervenes (default: 10).
  - `hard_timeout_minutes`: minutes before the supervisor forces termination (default: 30).

---

## GitHub Mode Configuration

To use GitHub as the Kata workflow backend, set `workflow.mode: github` in `.kata/preferences.md` and configure the `github:` block in the same file.

### `.kata/preferences.md` (project preferences)

```yaml
---
workflow:
  mode: github
github:
  repoOwner: my-org
  repoName: my-repo
  stateMode: labels          # or projects_v2
  githubProjectNumber: 7     # optional
  labelPrefix: kata:         # optional
---
```

Kata derives workflow phase from labels by default (`stateMode: labels`). Use `projects_v2` when your workflow state comes from a GitHub Project.

In GitHub mode planning, `/kata plan` persists milestone/slice/task artifacts into GitHub issues with stable Kata metadata markers (`KATA:GITHUB_ARTIFACT`) and idempotent upsert semantics. Roadmap `depends:[]` entries are materialized as durable dependency metadata on slice artifacts.

### GitHub Token

Kata resolves the GitHub token in this order:

1. `KATA_GITHUB_TOKEN` (env) — Kata-specific override
2. `GH_TOKEN` (env) — `gh` CLI standard
3. `GITHUB_TOKEN` (env) — broad GitHub convention
4. `auth.json` `github` provider — add manually under `~/.kata-cli/agent/auth.json`

To check GitHub mode readiness:

```text
Kata prefs status
mode: github
GITHUB_TOKEN: present (via KATA_GITHUB_TOKEN)
github.repo: my-org/my-repo
github.state_mode: labels
validation: valid
```

If GitHub mode is configured but not ready, the status output is actionable — for example `GITHUB_TOKEN: missing`, `diagnostic: missing_repo_owner`, or `diagnostic: missing_github_config`.

`/kata status` and `/kata` smart-entry now surface the same backend bootstrap diagnostics. If runtime initialization fails, the message includes diagnostic codes plus remediation actions and points back to `/kata prefs status` for full detail.

GitHub planning diagnostics emit structured signals for troubleshooting:
- `github_planning_artifact_upsert`
- `github_planning_dependency_materialized`
- `github_planning_roundtrip_mismatch`

These diagnostics never print token values; they only reference safe field names such as `KATA_GITHUB_TOKEN`, `GH_TOKEN`, and `GITHUB_TOKEN`.

---

## Inspecting Active Mode

Run `/kata prefs status` to see the active workflow mode, which preferences file is currently winning, and whether a Linear binding is ready.

Typical output:

```text
Kata prefs status
mode: linear
LINEAR_API_KEY: present
linear.teamKey: KAT
linear.projectSlug: 459f9835e809
validation: valid
resolved team: Kata-sh (KAT · a47bcacd-54f3-4472-a4b4-d6933248b605)
```

If Linear mode is configured but not ready, the status output stays redacted and actionable — for example `LINEAR_API_KEY: missing`, `diagnostic: missing_linear_team`, or `diagnostic: invalid_linear_project`.

Run `/kata pr status` to inspect the PR lifecycle configuration:

Canonical slice branches use the namespaced format `kata/<scope>/<milestone>/<slice>` (for example `kata/apps-cli/M003/S05`). Legacy `kata/<milestone>/<slice>` branches remain supported during transition.

```text
PR lifecycle: enabled
branch: kata/apps-cli/M003/S05
base_branch: main
auto_create: true
open PR: #70 — kata/apps-cli/M003/S05
```

When PR lifecycle is disabled or not configured:

```text
PR lifecycle: pr.enabled is false (disabled)
branch: kata/apps-cli/M003/S05
Set pr.enabled: true in .kata/preferences.md to activate the PR workflow.
```

## Best Practices

- Keep `always_use_skills` short.
- Use `skill_rules` for situational routing, not broad personality preferences.
- Prefer skill names for stable built-in skills.
- Prefer absolute paths for local personal skills.
- Use `linear.teamKey` when you want a readable binding; use `linear.teamId` when you already have the UUID.
- Keep config in preferences.
- Keep credentials in `~/.kata-cli/agent/auth.json` (preferred) or env vars.
- Never place API keys/tokens directly in preferences files.

---

## Models Example

```yaml
---
version: 1
models:
  research: claude-sonnet-4-6
  planning: claude-opus-4-6
  execution: claude-sonnet-4-6
  completion: claude-sonnet-4-6
  review: claude-sonnet-4-6
---
```

Opus for planning (where architectural decisions matter most), Sonnet for everything else (faster, cheaper). The `review` key sets the model for PR reviewer subagents — Sonnet is recommended (faster, parallel-friendly). Model preferences apply to both `/kata auto` and `/kata step`. Omit any key to use the currently selected model.

---

## Example Variations

**Linear-mode — project bound to Linear:**

```yaml
---
version: 1
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectSlug: 459f9835e809
prefer_skills:
  - linear
custom_instructions:
  - "Treat Linear as the workflow source of truth for planning and status"
---
```

Kata typically hydrates `LINEAR_API_KEY` from `~/.kata-cli/agent/auth.json`; setting it manually in your shell/.env is optional.

**PR lifecycle — auto-create PRs after each slice:**

```yaml
---
version: 1
pr:
  enabled: true
  auto_create: true
  base_branch: main
  review_on_create: false
  linear_link: false
---
```

Set `auto_create: true` for fully automated PR creation after each slice in auto-mode. Set `review_on_create: true` to chain into a parallel review immediately after creation.

**Symphony — connect to a local or remote Symphony server:**

```yaml
---
version: 1
symphony:
  url: http://localhost:8080
---
```

This enables `/symphony status` and `/symphony watch <issue>`. Alternatively set `KATA_SYMPHONY_URL=http://localhost:8080` in your environment.

**Skill routing — always load a UAT skill and route Clerk tasks:**

```yaml
---
version: 1
always_use_skills:
  - /Users/you/.claude/skills/verify-uat
skill_rules:
  - when: finishing implementation and human judgment matters
    use:
      - /Users/you/.claude/skills/verify-uat
---
```

**Richer routing — prefer cleanup and authentication skills:**

```yaml
---
version: 1
prefer_skills:
  - commit-ignore
skill_rules:
  - when: task involves Clerk authentication
    use:
      - clerk
      - clerk-setup
  - when: the user is looking for installable capability rather than implementation
    prefer:
      - find-skills
---
```
