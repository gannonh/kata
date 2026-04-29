# Changelog

## 0.16.0-alpha.0

- Alpha release for the M001 CLI skill-platform validation milestone.
- Reframes `@kata-sh/cli` as the portable Kata Skills runtime/backend contract bridge rather than the legacy orchestrator package.
- Ships the Pi-first integration path for installing and executing Kata Skills through typed CLI operations.
- Preserves future requirements as carry-forward candidates so completed milestones can close while deferred work remains visible to new milestone planning.
- Publishes as a prerelease; install with `npm install -g @kata-sh/cli@alpha` until Symphony and Desktop integrations finish hardening.

## 0.16.0

- Reserved for the stable CLI skill-platform release after the alpha validation cycle.

- Split legacy CLI into `apps/cli-legacy` and introduced the new runtime-focused `apps/cli`.
- `setup --pi` now uses a single canonical skill source policy:
  - monorepo/dev: `apps/cli/skills`
  - packaged publish: bundled `skills/` inside `@kata-sh/cli`
- Removed legacy extension-resource dependency from the new runtime backend path.
