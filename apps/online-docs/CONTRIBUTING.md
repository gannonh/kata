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

- Keep docs focused on Kata CLI, Kata Desktop, Kata Symphony, and Kata Context.
- Use `Pi` or `Pi runtime` for agent execution. Use `Kata CLI` for backend IO and setup commands.
- Update `docs.json` when adding or removing pages from navigation.
- Use root-relative links without file extensions, such as `/cli/overview`.
- Keep command examples aligned with the current package versions and release notes.
