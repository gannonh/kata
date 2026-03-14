<div align="center">

# Kata

**型** · /ˈkɑːtɑː/ · *noun* - a choreographed pattern practiced repeatedly until perfected

![alt text](assets/brand/logo-circle-dark.png)
<br>
[kata.sh](https://kata.sh)

</div>

---

## Kata Monorepo

This is the Kata monorepo for three AI agent products:

- Kata CLI in `apps/cli`
- Kata Desktop in `apps/electron`
- Kata Orchestrator in `apps/orchestrator`

The repo also contains shared packages that support the product apps.

## Products

| Product                                          | Path                | Use it for                                                                                   | Quick start                                                 |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Kata CLI](apps/cli/README.md)                   | `apps/cli`          | Terminal-based coding work with guided and autonomous execution modes                        | `npx @kata-sh/cli`                                          |
| [Kata Desktop](apps/electron/README.md)          | `apps/electron`     | Desktop-based agent work with workspaces, session management, sources, and approval controls | [GitHub Releases](https://github.com/gannonh/kata/releases) |
| [Kata Orchestrator](apps/orchestrator/README.md) | `apps/orchestrator` | Spec-driven workflows for Claude Code, OpenCode, Gemini CLI, and Codex                       | `npx @kata-sh/orc@latest`                                   |

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

| Path                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `apps/cli`          | Kata CLI                                                   |
| `apps/electron`     | Kata Desktop                                               |
| `apps/orchestrator` | Kata Orchestrator                                          |
| `apps/online-docs`  | Online documentation site                                  |
| `apps/viewer`       | Viewer app                                                 |
| `packages/core`     | Shared types                                               |
| `packages/shared`   | Shared agent, auth, config, git, session, and source logic |
| `packages/ui`       | Shared UI code                                             |
| `packages/mermaid`  | Shared Mermaid package                                     |

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

| Command                            | Purpose                                      |
| ---------------------------------- | -------------------------------------------- |
| `bun run electron:dev`             | Start Kata Desktop in development mode       |
| `cd apps/cli && npm run build`     | Build Kata CLI                               |
| `cd apps/orchestrator && npm test` | Run Kata Orchestrator tests                  |
| `bun run typecheck:all`            | Run TypeScript checks across shared packages |

## Testing

| Command            | Runs                                   |
| ------------------ | -------------------------------------- |
| `bun run test`     | Shared package and desktop unit tests  |
| `bun run test:cli` | Kata CLI tests                         |
| `bun run test:all` | Shared package, desktop, and CLI tests |
| `bun run test:e2e` | Desktop Playwright tests               |

The CLI uses Node's built-in test runner. The shared packages and desktop tests use Bun.

## License

Kata CLI and Kata Orchestrator use MIT. Kata Desktop uses Apache 2.0.
