# Contribute to Kata docs

Kata docs use Mintlify and live in `apps/online-docs`.

## Local development

```bash
pnpm --dir apps/online-docs run docs:dev
```

Preview at `http://localhost:3001`.

## Check links

```bash
pnpm --dir apps/online-docs run broken-links
```

## Guidelines

- Keep active docs focused on Kata CLI, Kata Symphony, and Kata Context.
- Mark Orchestrator and Desktop content as archived when referenced.
- Update `docs.json` when adding or removing pages from navigation.
- Use root-relative links without file extensions, such as `/cli/overview`.
- Keep command examples aligned with the current package versions and release notes.
