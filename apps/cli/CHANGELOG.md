# Changelog

## 0.16.0

- Split legacy CLI into `apps/cli-legacy` and introduced the new runtime-focused `apps/cli`.
- `setup --pi` now uses a single canonical skill source policy:
  - monorepo/dev: `apps/orchestrator/dist/skills`
  - packaged publish: bundled `skills/` inside `@kata-sh/cli`
- Removed legacy extension-resource dependency from the new runtime backend path.
