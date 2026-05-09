# Docs site audit and source inventory

Date: 2026-05-08

## Current active products

- `cli/*` and CLI reference pages document `apps/cli` (`@kata-sh/cli` 0.16.0).
- `desktop/*` documents `apps/desktop`.
- `symphony/*` and Symphony reference pages document `apps/symphony` (Symphony 2.3.0).
- `context/*` documents `apps/context`.
- Site config and navigation live in `apps/online-docs/docs.json`.

## Current docs checks

- CLI docs describe stable `@kata-sh/cli` 0.16.0, GitHub Projects v2, Linear setup, and Linear doctor checks.
- Symphony docs describe project-local `.symphony/`, direct `symphony helper` calls through `SYMPHONY_BIN`, GitHub Projects v2 requirements, Linear support, and `SYMPHONY_LOG` logging.
- Desktop docs describe Pi for agent execution and Kata CLI as the backend IO/setup CLI.
- `docs.json` navigation lists active product docs only.

## Maintenance checklist

- Run `pnpm --dir apps/online-docs run broken-links` after docs changes.
- Keep CLI backend preferences in sync with `apps/cli/src/backends/read-tracker-config.ts`.
- Keep Symphony workflow docs in sync with `apps/symphony/src/config.rs` and `apps/symphony/src/helper.rs`.
- Keep release docs in sync with package versions and changelogs.
