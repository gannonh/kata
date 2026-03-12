# Kata

Monorepo for Kata — AI coding agents for terminal and desktop.

## Apps

| App                             | Description                                           |
| ------------------------------- | ----------------------------------------------------- |
| [apps/cli](apps/cli/)           | Terminal coding agent built on pi-coding-agent        |
| [apps/electron](apps/electron/) | Desktop GUI with session management, MCP, and sources |

## Packages

| Package                             | Description                                                  |
| ----------------------------------- | ------------------------------------------------------------ |
| [packages/core](packages/core/)     | Shared types                                                 |
| [packages/shared](packages/shared/) | Business logic (agent, auth, config, git, sessions, sources) |

## Setup

```bash
bun install
```

### CLI

```bash
cd apps/cli
npx tsc
npm run copy-themes
node dist/loader.js
```

### Desktop

```bash
bun run electron:dev
```

## Testing

### Test Scripts

| Script                         | Runner     | What it runs                          |
| ------------------------------ | ---------- | ------------------------------------- |
| `bun run test`                 | bun        | All package + desktop unit tests      |
| `bun run test:packages`        | bun        | `packages/` unit tests only           |
| `bun run test:desktop`         | bun        | `apps/electron/src/` unit tests only  |
| `bun run test:cli`             | Node       | `apps/cli/` tests (extension + smoke) |
| `bun run test:all`             | both       | All of the above                      |
| `bun run test:e2e`             | Playwright | Desktop E2E tests (mocked, headless)  |
| `bun run test:e2e:headed`      | Playwright | Desktop E2E with visible browser      |
| `bun run test:e2e:ui`          | Playwright | Desktop E2E with Playwright UI        |
| `bun run test:e2e:debug`       | Playwright | Desktop E2E with debugger             |
| `bun run test:e2e:live`        | Playwright | Desktop E2E against live app          |
| `bun run test:e2e:live:headed` | Playwright | Live E2E with visible browser         |
| `bun run test:e2e:live:debug`  | Playwright | Live E2E with debugger                |

The CLI uses Node's built-in test runner (`node --test`) because it depends on `@mariozechner/pi-coding-agent` which requires Node ESM resolution. Everything else uses bun.

### CI Gates

CI runs on every pull request with path-based filtering:

| Job            | Runs when                              | What it does                                          |
| -------------- | -------------------------------------- | ----------------------------------------------------- |
| `validate`     | Always | Typecheck, lint, unit tests, coverage, electron build |
| `e2e-mocked`   | `apps/electron/` or `packages/` change | Playwright E2E tests (headless, mocked)               |
| `validate-cli` | `apps/cli/` changes                    | TypeScript check + CLI tests                          |

The pre-push git hook mirrors this behavior — it always runs `validate:ci`, then conditionally runs E2E and CLI tests based on what files changed.

### Validation Scripts

| Script                   | Description                                                             |
| ------------------------ | ----------------------------------------------------------------------- |
| `bun run validate:ci`    | Full CI gate: typecheck + lint + unit tests + coverage + electron build |
| `bun run validate:local` | CI gate + desktop E2E                                                   |

## License

MIT (CLI) / Apache 2.0 (Desktop)
