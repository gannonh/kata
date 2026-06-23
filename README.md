<div align="center">

# Kata

**型** · /ˈkɑːtɑː/ · *noun* - a choreographed pattern practiced repeatedly until perfected

![alt text](assets/brand/logo-circle-dark.png)
<br>
[kata.sh](https://kata.sh)

</div>

---

## Kata Monorepo

This is the Kata monorepo for two active AI agent products:

- Kata CLI in `apps/cli`
- Kata Symphony in `apps/symphony`

The repo also contains shared packages that support the product apps.

## Products

| Product                                  | Path            | Use it for                                                                                                   | Quick start                   |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| [Kata CLI](apps/cli/README.md)           | `apps/cli`      | Backend IO and setup CLI used by Kata skills for project planning/execution workflows                        | `npm install -g @kata-sh/cli` |
| [Kata Symphony](apps/symphony/README.md) | `apps/symphony` | Headless orchestrator: polls GitHub or Linear, dispatches parallel agent sessions, manages full PR lifecycle | `cargo build --release`       |

## Kata CLI

Kata CLI is the backend IO and setup CLI for Kata Skills. It owns typed project, milestone, slice, task, and artifact operations while agent harnesses such as Pi and Symphony own chat and worker execution.

Quick start:

```bash
npm install -g @kata-sh/cli
kata setup --pi
```

For local development:

```bash
pnpm --dir apps/cli run build
pnpm --dir apps/cli run test
```

Use Kata CLI when you want:

- portable Kata Skills installable into multiple harnesses
- durable backend operations through GitHub Projects v2 or Linear
- typed backend operations for planning, execution, verification, progress, and milestone completion

Read more in [apps/cli/README.md](apps/cli/README.md).

## Kata Symphony

Kata Symphony is a headless orchestrator that polls a GitHub Projects v2 board or Linear project for candidate issues and dispatches parallel agent sessions to work on them autonomously. It manages the full ticket lifecycle - from Todo through implementation, PR creation, automated code review, human review, and merge - with multi-turn sessions, real-time event streaming, and a live HTTP dashboard.

Quick start:

```bash
cd apps/symphony
cargo build --release

cd /path/to/your/repo
/path/to/kata/apps/symphony/target/release/symphony init
$EDITOR .symphony/WORKFLOW.md
$EDITOR .symphony/prompts/repo.md

GH_TOKEN=github_pat_... /path/to/kata/apps/symphony/target/release/symphony --port 8080
# or: LINEAR_API_KEY=lin_api_... /path/to/kata/apps/symphony/target/release/symphony --port 8080
```

Key features:

- **GitHub and Linear integration** - polls for issues, manages state transitions, respects priorities and dependency graphs
- **Parallel agents** - configurable concurrency with per-state slot limits
- **Multi-turn sessions** - agents continue on the same worker session across turns, preserving conversation history
- **Full PR lifecycle** - agents create PRs, address review feedback, resolve comment threads, and merge
- **Real-time streaming** - events flow from workers to the orchestrator as they happen
- **Project-local config** - `symphony init` writes `.symphony/WORKFLOW.md`, starter prompts, and reference docs
- **Dynamic config reload** - WORKFLOW.md changes take effect without restart
- **SSH worker pools** - distribute sessions across remote machines
- **HTTP dashboard + JSON API** - live observability at `localhost:8080`

Use Kata Symphony when you want:

- autonomous ticket-to-merge execution without human intervention
- parallel agent sessions working through a tracker backlog
- a headless orchestrator you can run on a server or CI

### Pi Coding Agent extension

Symphony users on Pi can install `@kata-sh/pi-symphony-extension` to initialize, start, attach to, and monitor Symphony from Pi. It adds `/symphony:*` commands and a live console for running workers, retry queue entries, blocked issues, completed issues, and pending escalations.

```bash
pi install npm:@kata-sh/pi-symphony-extension
# or, from the monorepo package:
pi install git:github.com/gannonh/kata
```

Read more in [apps/symphony/pi-extension/README.md](apps/symphony/pi-extension/README.md).

Read more in [apps/symphony/README.md](apps/symphony/README.md).

## Repository layout

| Path                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `apps/cli`            | Kata CLI                                                   |
| `apps/symphony`       | Kata Symphony (Rust)                                       |
| `apps/cli/skills-src` | Source of truth for Kata Agent Skills                      |
| `packages/core`       | Shared types                                               |
| `packages/shared`     | Shared agent, auth, config, git, session, and source logic |
| `packages/ui`         | Shared UI components                                       |
| `packages/mermaid`    | Mermaid diagram renderer                                   |

## Local Development

Install dependencies:

```bash
pnpm install
```

Install repo-managed git hooks:

```bash
pnpm run githooks:install
```

Common commands:

| Command                           | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `pnpm run validate`               | Lint + typecheck + test all packages via Turbo |
| `pnpm run validate:affected`      | Same, only changed packages                    |
| `cd apps/symphony && cargo build` | Build Kata Symphony                            |

## Testing

All testing is orchestrated by Turborepo. Each package owns its test runner.

| Command                  | Runs                            |
| ------------------------ | ------------------------------- |
| `pnpm run test`          | All package tests via Turborepo |
| `pnpm run test:affected` | Only changed packages           |

| Package    | Test runner           | Notes                                |
| ---------- | --------------------- | ------------------------------------ |
| symphony   | cargo test            | Rust, runs through package.json shim |
| all others | package-local scripts | JS/TS packages run through Turborepo |

A pre-push git hook runs `turbo run lint typecheck test --affected` before every push.

## License

Kata packages use the licenses declared in their package directories.
