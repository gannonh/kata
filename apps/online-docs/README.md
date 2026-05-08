# Kata online docs

Mintlify documentation for Kata CLI, Kata Symphony, and Kata Context.

## Develop locally

From the monorepo root:

```bash
pnpm --dir apps/online-docs run docs:dev
```

The local preview runs on port 3001.

## Check links

```bash
pnpm --dir apps/online-docs run broken-links
```

## Structure

- `docs.json` controls navigation.
- `index.mdx`, `introduction.mdx`, and `quickstart.mdx` are the entry pages.
- `cli/*` documents `@kata-sh/cli`.
- `symphony/*` documents the Rust Symphony runtime.
- `context/*` documents `@kata/context`.
- `reference/*` contains command, configuration, and API references.

Archived Orchestrator and Desktop content should stay out of active navigation unless clearly marked as legacy.
