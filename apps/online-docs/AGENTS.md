# Kata online docs

This directory contains the Mintlify documentation site for Kata.

## Source of truth

- Site navigation lives in `docs.json`.
- Product docs should match the active apps:
  - Kata CLI: `apps/cli`
  - Kata Desktop: `apps/desktop`
  - Kata Symphony: `apps/symphony`
  - Kata Context: `apps/context`.

## Local commands

```bash
pnpm --dir apps/online-docs run docs:dev
pnpm --dir apps/online-docs run broken-links
```

## Writing guidelines

- Use active voice and concise sentences.
- Use `Kata CLI`, `Kata Desktop`, `Kata Symphony`, and `Kata Context` consistently.
- Use `Pi` or `Pi runtime` for agent execution. Use `Kata CLI` for backend IO and setup commands.
- Use `GitHub Projects v2` when describing GitHub-backed state.
- Use `Linear` for Linear-backed project state.
- Format file names, commands, paths, and code references with backticks.
- Prefer updating existing pages over adding new pages.
- Add new pages to `docs.json` when they should appear in navigation.
