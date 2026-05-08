# Changelog

## 0.16.0

- Stable release for the Kata Skills runtime and backend contract bridge.
- Adds Linear backend support for Kata project, milestone, slice, task, issue, status, artifact, and health operations.
- Adds Linear setup and doctor flows, including interactive onboarding, auth checks, project access checks, workflow-state validation, and GraphQL capability checks.
- Adds standalone issue planning and execution skills with `issue.listOpen`, `issue.create`, `issue.get`, and `issue.updateStatus` operations.
- Expands roadmap planning with slice dependencies, native dependency links, slice maps, and implementation waves.
- Hardens GitHub Projects v2 behavior around native issue state, milestones, sub-issues, and issue dependency links.
- Expands setup targets and skill installation hygiene across Pi, local/global agent skills, Claude skills, and Cursor skills.
- Loads project `.env` files for CLI and skill helper calls, and adds an artifact-input helper for writing rich Markdown reports through JSON payloads.
- Split legacy CLI into `apps/cli-legacy` and introduced the new runtime-focused `apps/cli`.
- `setup --pi` uses a single canonical skill source policy:
  - monorepo/dev: `apps/cli/skills`
  - packaged publish: bundled `skills/` inside `@kata-sh/cli`
- Removed legacy extension-resource dependency from the runtime backend path.

## 0.16.0-alpha.0

- Alpha release for the M001 CLI skill-platform validation milestone.
- Reframes `@kata-sh/cli` as the portable Kata Skills runtime/backend contract bridge rather than the legacy orchestrator package.
- Ships the Pi-first integration path for installing and executing Kata Skills through typed CLI operations.
- Preserves future requirements as carry-forward candidates so completed milestones can close while deferred work remains visible to new milestone planning.
- Publishes as a prerelease; install with `npm install -g @kata-sh/cli@alpha` until Symphony and Desktop integrations finish hardening.

