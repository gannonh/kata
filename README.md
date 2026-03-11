# Kata

Monorepo for Kata — AI coding agents for terminal and desktop.

## Apps

| App | Description |
|-----|-------------|
| [apps/cli](apps/cli/) | Terminal coding agent built on pi-coding-agent |
| [apps/electron](apps/electron/) | Desktop GUI with session management, MCP, and sources |

## Packages

| Package | Description |
|---------|-------------|
| [packages/core](packages/core/) | Shared types |
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

## License

MIT (CLI) / Apache 2.0 (Desktop)
