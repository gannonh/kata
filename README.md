<div align="center">

# Kata

**型** · /ˈkɑːtɑː/ · *noun* - a choreographed pattern practiced repeatedly until perfected

![alt text](assets/brand/logo-circle-dark.png)
<br>
[kata.sh](https://kata.sh)

</div>

---

## Kata Monorepo

This is the Kata monorepo for four active AI agent products:

- Kata CLI in `apps/cli`
- Kata Symphony in `apps/symphony`
- Kata Desktop in `apps/desktop`
- Kata Context in `apps/context`

The repo also contains shared packages that support the product apps. The former Kata Orchestrator app is archived at `apps/orchestrator-legacy` for reference only; the active Agent Skills source now lives in `apps/cli/skills-src`.

## Products

| Product                                          | Path                | Use it for                                                                                         | Quick start                                                 |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [Kata CLI](apps/cli/README.md)                   | `apps/cli`          | Portable Kata Skills runtime and backend contract bridge for project planning/execution workflows  | `npm install -g @kata-sh/cli@alpha`                         |
| [Kata Symphony](apps/symphony/README.md)         | `apps/symphony`     | Headless orchestrator: polls Linear, dispatches parallel agent sessions, manages full PR lifecycle | `cargo build --release`                                     |
| [Kata Desktop](apps/desktop/AGENTS.md)            | `apps/desktop`      | Native GUI with planning view, workflow kanban, and Symphony operator surface                       | [GitHub Releases](https://github.com/gannonh/kata/releases) |
| Kata Context                                     | `apps/context`      | Structural, semantic, and memory-based codebase understanding for AI coding agents                 | `npx @kata/context`                                         |

## Kata CLI

Kata CLI is now the portable runtime and backend contract bridge for Kata Skills. It owns typed project, milestone, slice, task, and artifact operations while harnesses such as Pi, Symphony, Desktop, or future agents own the chat/runtime experience.

The `0.16.0-alpha.*` line is the M001 validation release for this skill-platform architecture. Pi is the first direct integration; Symphony and Desktop are moving onto the same contract next.

Quick start:

```bash
npm install -g @kata-sh/cli@alpha
kata setup --pi
```

For local development:

```bash
pnpm --dir apps/cli run build
pnpm --dir apps/cli run test
```

Use Kata CLI when you want:

- portable Kata Skills installable into multiple harnesses
- durable backend operations through GitHub Projects v2 or other adapters
- a typed runtime contract for planning, execution, verification, progress, and milestone completion

Read more in [apps/cli/README.md](apps/cli/README.md).

## Kata Symphony

Kata Symphony is a headless orchestrator that polls a Linear project for candidate issues and dispatches parallel agent sessions to work on them autonomously. It manages the full ticket lifecycle — from Todo through implementation, PR creation, automated code review, human review, and merge — with multi-turn sessions, real-time event streaming, and a live HTTP dashboard.

Quick start:

```bash
cd apps/symphony
cargo build --release

# Create a WORKFLOW.md with your Linear project config and agent prompt
# (see apps/symphony/docs/WORKFLOW-REFERENCE.md for all settings)

LINEAR_API_KEY=lin_api_... ./target/release/symphony WORKFLOW.md --port 8080
```

Key features:

- **Linear integration** — polls for issues, manages state transitions, respects priorities and dependency graphs
- **Parallel agents** — configurable concurrency with per-state slot limits
- **Multi-turn sessions** — agents continue on the same Codex thread across turns, preserving conversation history
- **Full PR lifecycle** — agents create PRs, address review feedback, resolve comment threads, and merge
- **Real-time streaming** — events flow from workers to the orchestrator as they happen
- **Dynamic config reload** — WORKFLOW.md changes take effect without restart
- **SSH worker pools** — distribute sessions across remote machines
- **HTTP dashboard + JSON API** — live observability at `localhost:8080`

Use Kata Symphony when you want:

- autonomous ticket-to-merge execution without human intervention
- parallel agent sessions working through a Linear backlog
- a headless orchestrator you can run on a server or CI

Read more in [apps/symphony/README.md](apps/symphony/README.md).

## Kata Desktop

Kata Desktop is a native Electron app that brings together planning, workflow state, and Symphony's autonomous orchestration in one surface. It is moving toward the Pi coding-agent runtime with prepackaged Kata skills, CLI backend operations, and Symphony binaries.

Download a release from [GitHub Releases](https://github.com/gannonh/kata/releases), or run it from source:

```bash
cd apps/desktop
bun install
bun run build && bun run start
```

Key features:

- **Chat** — Streaming chat with tool rendering, thinking blocks, permission modes (Explore/Ask/Auto), multi-provider support
- **Planning view** — Right-pane live rendering of planning artifacts (roadmaps, requirements, decisions) as the agent works
- **Workflow kanban** — Linear-backed kanban board showing slice and task execution state in real time
- **Symphony operator** — Start/stop Symphony from the app, watch workers execute, respond to escalations inline
- **Sessions** — Multi-session sidebar with persistence, workspace picker, model selector

The app bundles the Pi runtime launcher, Kata CLI backend, Kata skills, Symphony binary, and Bun so it works out of the box.

Use Kata Desktop when you want:

- planning and execution in one GUI with live artifact updates
- a kanban view of Linear workflow state backed by agent execution
- a built-in Symphony operator surface without running a separate dashboard

Read more in [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md).

## Kata Context

Kata Context provides structural, semantic, and memory-based codebase understanding for AI coding agents. It indexes source files using tree-sitter, builds a dependency graph stored in SQLite, and exposes commands for graph queries, grep, and file discovery.

```bash
npx @kata/context
```

| Path                | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `apps/cli`          | Kata CLI                                                   |
| `apps/symphony`     | Kata Symphony (Rust)                                       |
| `apps/context`      | Kata Context                                               |
| `apps/desktop`      | Kata Desktop                                               |
| `apps/cli/skills-src` | Source of truth for Kata Agent Skills                    |
| `apps/orchestrator-legacy` | Archived legacy Orchestrator reference              |
| `apps/online-docs`  | Documentation site                                         |
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

| Command                           | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `bun run validate`                | Lint + typecheck + test all packages via Turbo |
| `bun run validate:affected`       | Same, only changed packages                    |
| `cd apps/desktop && bun run dev:renderer` | Start Desktop renderer in dev mode |
| `cd apps/symphony && cargo build` | Build Kata Symphony                            |

## Testing

All testing is orchestrated by Turborepo. Each package owns its test runner.

| Command                 | Runs                                          |
| ----------------------- | --------------------------------------------- |
| `bun run test`          | All package tests via Turborepo               |
| `bun run test:affected` | Only changed packages                         |
| `cd apps/desktop && bun run test:e2e` | Desktop Playwright E2E            |

| Package    | Test runner | Notes                                   |
| ---------- | ----------- | --------------------------------------- |
| context    | Vitest      | Uses better-sqlite3 (native Node addon) |
| symphony   | cargo test  | Rust, runs through package.json shim    |
| all others | package-local scripts | JS/TS packages run through Turborepo |

A pre-push git hook runs `turbo run lint typecheck test --affected` before every push.

## License

Kata packages use the licenses declared in their package directories.
