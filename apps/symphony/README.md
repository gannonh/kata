# Kata Symphony

Headless orchestrator that polls a Linear project for candidate issues and dispatches parallel agent sessions to work on them autonomously. Manages the full ticket lifecycle — from Todo through implementation, PR creation, automated code review, human review, and merge.

## Features

- **Linear integration** — polls for issues, manages state transitions, respects priorities and dependency graphs
- **Parallel agents** — configurable concurrency with per-state slot limits
- **Multi-turn sessions** — agents continue on the same Codex thread across turns, preserving conversation history
- **Full PR lifecycle** — agents create PRs, address review feedback, resolve comment threads, and merge
- **Real-time event streaming** — events flow from workers to the orchestrator as they happen
- **Dynamic config reload** — WORKFLOW.md changes take effect without restart
- **SSH worker pools** — distribute sessions across remote machines
- **HTTP dashboard + JSON API** — live observability

## Quick Start

```bash
# Build
cargo build --release

# Configure
# Copy docs/WORKFLOW-REFERENCE.md to your project root as WORKFLOW.md
# and customize the settings (Linear project, repo URL, agent config)

# Run
LINEAR_API_KEY=lin_api_... ./target/release/symphony WORKFLOW.md --port 8080
```

## Ticket Lifecycle

```
Todo → In Progress → Agent Review (bot feedback) → Human Review → Merging → Done
                                                    ↳ Agent Review (human feedback) ↲
                                                    ↳ Rework → In Progress
```

| Status | Set by | What happens |
|---|---|---|
| Todo | Human | Queued for agent work |
| In Progress | Orchestrator | Agent is implementing |
| Agent Review | Agent/Human | Agent addresses PR review comments |
| Human Review | Agent | PR is clean, waiting for human approval |
| Merging | Human | Agent merges the approved PR |
| Rework | Human | Agent scraps current approach, starts fresh |
| Done | Agent | Terminal — PR merged |

## Configuration

All configuration lives in a `WORKFLOW.md` file — YAML front-matter for settings, markdown body for the agent prompt template.

See [`docs/WORKFLOW-REFERENCE.md`](docs/WORKFLOW-REFERENCE.md) for the fully documented reference template with all settings.

Key settings:

```yaml
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: "your-project-slug"
  # assignee: alice              # filter to one user

workspace:
  root: ~/symphony-workspaces
  repo: https://github.com/you/repo.git
  strategy: clone                 # clone or worktree
  branch_prefix: symphony

agent:
  max_concurrent_agents: 2
  max_turns: 20

codex:
  command: codex app-server
  stall_timeout_ms: 900000
  approval_policy: never

server:
  port: 8080
```

## Development

```bash
# Build
cargo build

# Test (251 tests)
cargo test

# Lint
cargo clippy -- -D warnings

# Format
cargo fmt
```

See [AGENTS.md](AGENTS.md) for full architecture reference, module layout, test harness details, and development conventions.
