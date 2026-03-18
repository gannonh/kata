<div align="center">

# Kata

**型** · /ˈkɑːtɑː/ · *noun* - a choreographed pattern practiced repeatedly until perfected

![alt text](assets/brand/logo-circle-dark.png)
<br>
[kata.sh](https://kata.sh)

</div>

---

## Kata Monorepo

This is the Kata monorepo for five AI agent products:

- Kata CLI in `apps/cli`
- Kata Desktop in `apps/electron`
- Kata Orchestrator in `apps/orchestrator`
- Kata Context in `apps/context`
- Symphony in `apps/symphony`

The repo also contains shared packages that support the product apps.

## Products

| Product                                          | Path                | Use it for                                                                                   | Quick start                                                 |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Kata CLI](apps/cli/README.md)                   | `apps/cli`          | Terminal-based coding work with guided and autonomous execution modes                        | `npx @kata-sh/cli`                                          |
| [Kata Desktop](apps/electron/README.md)          | `apps/electron`     | Desktop-based agent work with workspaces, session management, sources, and approval controls | [GitHub Releases](https://github.com/gannonh/kata/releases) |
| [Kata Orchestrator](apps/orchestrator/README.md) | `apps/orchestrator` | Spec-driven workflows for Claude Code, OpenCode, Gemini CLI, and Codex                       | `npx @kata-sh/orc@latest`                                   |
| Kata Context                                     | `apps/context`      | Structural, semantic, and memory-based codebase understanding for AI coding agents           | `npx @kata/context`                                         |
| Symphony                                         | `apps/symphony`     | Polls Linear, dispatches agent sessions via workflow definitions                             | Rust binary (in development)                                |

## Kata CLI

Kata CLI is a terminal coding agent. It breaks work into milestones, slices, and tasks, then executes with structured planning, verification, and fresh context windows. It supports stepwise operation, autonomous execution, and a two-terminal steering workflow.

Quick start:

```bash
npx @kata-sh/cli
```

Or install globally:

```bash
npm install -g @kata-sh/cli
kata-cli
```

Use Kata CLI when you want:

- a terminal-first workflow
- direct repo access from the command line
- guided or autonomous execution inside one tool

Read more in [apps/cli/README.md](apps/cli/README.md).

## Kata Desktop

Kata Desktop is a desktop app for working with AI agents across multiple sessions and workspaces. It includes Git context, permission modes, MCP integrations, external sources, background tasks, file attachments, and persistent session state.

Download a release from [GitHub Releases](https://github.com/gannonh/kata/releases), or run it from source:

```bash
bun install
bun run electron:start
```

Use Kata Desktop when you want:

- a desktop workspace for managing multiple agent sessions
- approval controls for read, edit, and autonomous actions
- connected sources such as MCP servers, REST APIs, and local files

Read more in [apps/electron/README.md](apps/electron/README.md).

## Kata Orchestrator

Kata Orchestrator provides a spec-driven development harness for supported terminal-based coding agents, including Claude Code, Codex, Gemini CLI, and OpenCode. It organizes work into discuss, plan, execute, and verify phases, runs execution in fresh subagent contexts, and writes project state to disk as structured files.

Quick start:

```bash
npx @kata-sh/orc@latest
```

Verify the install in your runtime:

```text
Claude Code / Gemini CLI: /kata:help
OpenCode: /kata-help
Codex: $kata-help
```

Use Kata Orchestrator when you want:

- a spec-driven workflow inside an existing coding runtime
- structured planning and verification across longer projects
- project artifacts written to disk instead of relying on one long session

Read more in [apps/orchestrator/README.md](apps/orchestrator/README.md).

## Kata Context

Kata Context provides structural, semantic, and memory-based codebase understanding for AI coding agents. It indexes source files using tree-sitter, builds a dependency graph stored in SQLite, and exposes commands for graph queries, grep, and file discovery.

```bash
npx @kata/context
```

## Symphony

Symphony is a Rust binary that polls Linear for workflow-triggering issues and dispatches agent sessions based on workflow definitions. It uses Liquid templates for prompt generation and supports configurable workspace layouts.

Symphony is in active development and not yet published. Build from source:

```bash
cd apps/symphony && cargo build --release
```

| Path                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `apps/cli`          | Kata CLI                                                   |
| `apps/context`      | Kata Context                                               |
| `apps/electron`     | Kata Desktop                                               |
| `apps/orchestrator` | Kata Orchestrator                                          |
| `apps/symphony`     | Symphony (Rust)                                            |
| `apps/online-docs`  | Online documentation site                                  |
| `apps/viewer`       | Session viewer                                             |
| `packages/core`     | Shared types                                               |
| `packages/shared`   | Shared agent, auth, config, git, session, and source logic |
| `packages/ui`       | Shared UI components                                       |
| `packages/mermaid`  | Mermaid diagram renderer                                   |

## Local Development

Install dependencies:

```bash
bun install
```

Install repo-managed git hooks:

```bash
bun run githooks:install
```

Common commands:

| Command                              | Purpose                                        |
| ------------------------------------ | ---------------------------------------------- |
| `bun run validate`                   | Lint + typecheck + test all packages via Turbo  |
| `bun run validate:affected`          | Same, only changed packages                    |
| `bun run electron:dev`               | Start Kata Desktop in development mode         |
| `cd apps/symphony && cargo build`    | Build Symphony                                 |

## Testing

All testing is orchestrated by Turborepo. Each package owns its test runner.

| Command                    | Runs                                           |
| -------------------------- | ---------------------------------------------- |
| `bun run test`             | All package tests via Turborepo                |
| `bun run test:affected`    | Only changed packages                          |
| `bun run test:e2e`         | Desktop Playwright E2E (mocked)                |
| `bun run test:e2e:live`    | Desktop Playwright E2E (real accounts, local)  |

| Package      | Test runner | Notes                                     |
| ------------ | ----------- | ----------------------------------------- |
| context      | Vitest      | Uses better-sqlite3 (native Node addon)   |
| symphony     | cargo test  | Rust, runs through package.json shim      |
| all others   | Bun test    | Default for JS/TS packages                |

A pre-push git hook runs `turbo run lint typecheck test --affected` before every push.

## License

Kata CLI and Kata Orchestrator use MIT. Kata Desktop uses Apache 2.0.
