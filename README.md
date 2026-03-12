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

| Job            | Runs when                                              | What it does                                          |
| -------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| `validate`     | Every PR                                               | Typecheck, lint, unit tests, coverage, electron build |
| `validate-cli` | Every PR                                               | TypeScript check + CLI tests                          |
| `e2e-mocked`   | PR bumps `apps/electron/package.json` version (release) | Playwright E2E tests (headless, mocked)               |

The pre-push git hook mirrors this: validate and CLI tests always run, desktop E2E only runs when the desktop version is bumped.

## License

MIT (CLI) / Apache 2.0 (Desktop)
