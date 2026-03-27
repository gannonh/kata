# Kata Symphony

Headless orchestrator that polls a Linear project for issues and dispatches parallel agent sessions to work on them. You run Symphony, point it at a Linear project, and it picks up tickets, clones your repo, runs an agent on each issue, creates PRs, addresses review feedback, and merges — all without human intervention.

![Symphony TUI Dashboard](../../assets/symphony-v1.0.0/symphony-tui.png)

## How It Works

1. Symphony polls your Linear project for issues in active states (e.g. `Todo`, `In Progress`)
2. For each issue, it creates an isolated workspace (clone of your repo) and starts an agent session
3. The agent reads the issue, writes code, runs tests, creates a PR, and handles review feedback
4. When the issue reaches a terminal state (`Done`, `Closed`), the workspace is cleaned up
5. Multiple issues run in parallel, up to your configured concurrency limit

All configuration — tracker, workspace, agent, and the prompt template — lives in a single `WORKFLOW.md` file.

## Agent Backends

Symphony supports two agent backends. Choose with `agent.backend` in your WORKFLOW.md.

| Backend      | Config value                       | What it runs            | Models                                                                           |
| ------------ | ---------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| **Kata CLI** | `kata-cli` (alias: `kata`) | Kata CLI in RPC mode    | Any model supported by pi-ai: Anthropic, OpenAI, Google, Mistral, Bedrock, Azure |
| **Codex**    | `codex`                            | OpenAI Codex app-server | OpenAI Codex models                                                              |

### Kata CLI backend (recommended)

```yaml
agent:
  backend: kata-cli
  max_concurrent_agents: 3
  max_turns: 20

kata_agent:                # alias: pi_agent
  command: kata            # or: npx @kata-sh/cli
  model: anthropic/claude-sonnet-4-6
  stall_timeout_ms: 300000
```

**Prerequisites:**

- **Kata CLI** — `npm install -g @kata-sh/cli`, or use `npx @kata-sh/cli` as the command
- **Provider auth** — either run `kata` interactively once to log in via browser, or set the provider's API key in your environment (e.g. `ANTHROPIC_API_KEY`)

### Codex backend

```yaml
agent:
  backend: codex
  max_concurrent_agents: 3
  max_turns: 20

codex:
  command: codex app-server
  stall_timeout_ms: 900000
  approval_policy: never
```

**Prerequisites:**

- **Codex** — `npm install -g @openai/codex`
- **Auth** — run `codex` once to log in via browser, or set `OPENAI_API_KEY`

## Prerequisites

- **Linear personal API key** — `LINEAR_API_KEY` in your environment
- **Agent backend** — Kata CLI or Codex (see above)
- **Git** — for workspace bootstrapping
- **Docker** (only for container-isolated workers) — Docker Desktop or Docker Engine running

## Installation

### Pre-built binaries

Download from [GitHub Releases](https://github.com/gannonh/kata/releases):

| Platform              | Binary                        |
| --------------------- | ----------------------------- |
| macOS (Apple Silicon) | `symphony-macos-arm64`        |
| Linux (x86_64)        | `symphony-linux-x86_64`       |
| Windows (x86_64)      | `symphony-windows-x86_64.exe` |

```bash
# Example: macOS Apple Silicon
curl -L https://github.com/gannonh/kata/releases/latest/download/symphony-macos-arm64 -o symphony
chmod +x symphony
```

### Build from source

Requires [Rust toolchain](https://rustup.rs/):

```bash
git clone https://github.com/gannonh/kata.git
cd kata/apps/symphony
cargo build --release
# Binary at: target/release/symphony
```

## Quick Start

### 1. Set up your environment

```bash
cp .env.example .env
```

Edit `.env` with your Linear API key:

```
LINEAR_API_KEY=lin_api_...
```

For agent auth, either:

- **Kata CLI backend:** run `kata` once to log in, or set your provider's API key (e.g. `ANTHROPIC_API_KEY`)
- **Codex backend:** run `codex` once to log in, or set `OPENAI_API_KEY`

### 2. Create a WORKFLOW.md

This project includes two example workflow files you can use as starting points:

- **[`docs/WORKFLOW-symphony.md`](docs/WORKFLOW-symphony.md)** — configured for the Symphony project (Rust/Cargo).
- **[`docs/WORKFLOW-cli.md`](docs/WORKFLOW-cli.md)** — configured for the Kata CLI project (TypeScript/Bun).

Both use **per-state prompt injection** — the orchestrator selects a focused prompt based on the issue's Linear state instead of sending one giant prompt. The `prompts/` directory contains the prompt files:

| File | When used | Job |
|------|-----------|-----|
| `prompts/shared-*.md` | Every dispatch | Repo context, Linear tools, workpad protocol |
| `prompts/in-progress.md` | `Todo`, `In Progress` | Implement, test, push, open PR → Agent Review |
| `prompts/agent-review.md` | `Agent Review` | Address PR comments → Human Review |
| `prompts/merging.md` | `Merging` | Land the PR → Done |
| `prompts/rework.md` | `Rework` | Close PR, fresh start |

The `in-progress.md` prompt automatically detects issue shape — flat tickets, Kata-planned slices (parent with children), and individual tasks — so one workflow handles both flat and hierarchical execution.

Copy an example to your project root as `WORKFLOW.md` and customize the `shared-*.md` file for your repo. The root `WORKFLOW.md` is gitignored since it contains local paths and credentials.

Copy one and adapt it to your project, or start from scratch:

```yaml
---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: your-project-slug    # from your Linear project URL

workspace:
  root: ~/symphony-workspaces
  repo: https://github.com/you/your-repo.git
  branch_prefix: symphony
  base_branch: main
  cleanup_on_done: true

agent:
  backend: kata-cli
  max_concurrent_agents: 3
  max_turns: 20

kata_agent:
  command: kata
  model: anthropic/claude-sonnet-4-6
---

You are working on {{ issue.identifier }}: {{ issue.title }}.

{{ issue.description }}

Work on branch origin/{{ workspace.base_branch }}.
Complete the task described in the issue.
```

The YAML front-matter is configuration. Everything below the `---` is a [Liquid template](https://shopify.github.io/liquid/) rendered as the prompt for each agent session, with `{{ issue.* }}` and `{{ workspace.* }}` variables available.

### 3. Run Symphony

```bash
symphony WORKFLOW.md
```

Optional flags:

| Flag                 | Default  | Description                                   |
| -------------------- | -------- | --------------------------------------------- |
| `--port <PORT>`      | `8080`   | HTTP server port                              |
| `--logs-root <PATH>` | *(none)* | Log file root directory                       |
| `--no-tui`           |          | Disable the live terminal dashboard (Ratatui) |
| `-h, --help`         |          | Print help                                    |

Symphony starts polling Linear. Open `http://localhost:8080` for the web dashboard, or watch the built-in terminal dashboard (enabled by default).

### 4. Create issues in Linear

Create issues in your Linear project. Set them to `Todo`. Symphony picks them up on the next poll cycle (default: every 30 seconds).

## Two Ways to Run Workers

Symphony supports two isolation modes for agent workspaces. You choose with `workspace.isolation` in your WORKFLOW.md.

### Local mode (default)

```yaml
workspace:
  isolation: local    # this is the default — you can omit it
  repo: /path/to/local/repo
  git_strategy: worktree
```

Workers run as bare processes on your machine. Symphony creates an isolated workspace for each issue and spawns the agent directly. Fast, simple, no Docker required.

**Recommended: `worktree` git strategy.** Git worktrees are instant to create, share the object store with your main repo, and show up in git clients so you can inspect agent work in progress.

**All `git_strategy` options:**

| Strategy                 | What it does                                                             | Best for                                                            |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `worktree` (recommended) | `git worktree add`                                                       | Local repos — instant setup, shared history, visible in git clients |
| `auto` (default)         | Picks clone-local or clone-remote based on whether repo is a path or URL | When you're not sure                                                |
| `clone-local`            | `git clone --local` with hard links                                      | Same volume, full isolation from main repo                          |
| `clone-remote`           | `git clone --single-branch`                                              | Remote repos, CI environments                                       |

### Docker mode

```yaml
workspace:
  isolation: docker
  repo: https://github.com/you/your-repo.git    # must be a remote URL
  docker:
    image: node:22-bookworm        # base Docker image
    setup: docker/setups/bun.sh    # optional: script to install extra tooling
    codex_auth: auto               # how the agent authenticates inside the container
```

**You don't create or manage containers.** Symphony does everything:

1. Builds a derived Docker image from your base image + setup script (cached by content hash)
2. Starts a disposable container for each issue (`docker run -d --rm ...`)
3. Clones your repo inside the container into `/workspace`
4. Runs the agent inside the container via `docker exec`
5. Stops and removes the container when the issue is done

You just need Docker Desktop (or Docker Engine) running. Symphony talks to the Docker daemon directly.

**Setup scripts** install language toolchains or extra dependencies on top of the base image. Bundled scripts in `docker/setups/`:

| Script      | What it installs                                   |
| ----------- | -------------------------------------------------- |
| `bun.sh`    | Bun runtime                                        |
| `python.sh` | Python 3, pip, venv                                |
| `rust.sh`   | Rust via rustup (stable toolchain)                 |
| `go.sh`     | Go (version configurable via `GO_VERSION` env var) |

Symphony caches the derived image using a hash of the base image name + setup script content. The first build takes time; subsequent runs reuse the cached image.

**Docker auth modes** — how the agent authenticates inside the container. Interactive browser login is not available inside containers, so an API key in your `.env` is the simplest path.

| Mode             | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `auto` (default) | Uses `OPENAI_API_KEY` env var if set, otherwise mounts `~/.codex/auth.json`      |
| `env`            | Passes `OPENAI_API_KEY` into the container. Fails if not set                     |
| `mount`          | Bind-mounts `~/.codex/auth.json` into the container. Fails if file doesn't exist |

**Extra container config:**

```yaml
workspace:
  docker:
    env:                              # additional env vars passed to the container
      - CARGO_HOME=/usr/local/cargo
    volumes:                          # additional bind mounts
      - ~/.ssh:/root/.ssh:ro
```

**Limitations of Docker mode:**

- `git_strategy` must be `auto` or `clone-remote` (clone-local and worktree require host filesystem access)
- `workspace.repo` must be a remote URL (local paths aren't accessible inside the container)

## Deploying Symphony on a Server

To run Symphony on a VPS or remote machine, use the provided Docker Compose setup. This runs Symphony itself inside a container, with access to the Docker socket so it can manage worker containers.

### Setup

All commands below run from the `docker/` directory:

```bash
cd docker/
```

**1. Configure the workflow** — edit `WORKFLOW-docker.md` with your project slug and repo URL:

```bash
vi WORKFLOW-docker.md
```

**2. Set up env vars:**

```bash
cp .env.example .env
vi .env    # set LINEAR_API_KEY and agent auth key (required for Docker)
```

**3. Start, monitor, and stop:**

```bash
# Build and start
docker compose up -d --build

# View logs (Ctrl+C to stop following)
docker compose logs -f

# Stop
docker compose down
```

**Web dashboard:** `http://localhost:8080` (or whatever port you set in `WORKFLOW-docker.md`).

Everything lives in the `docker/` directory. [`WORKFLOW-docker.md`](docker/WORKFLOW-docker.md) is a ready-to-edit template pre-configured for Docker isolation. The Compose file mounts it into the container. Symphony watches it for changes and reloads automatically.

The Docker socket is mounted so Symphony can create and manage worker containers as sibling containers (not nested).

## Ticket Lifecycle

```
Todo → In Progress → Agent Review → Human Review → Merging → Done
                         ↑               |
                         └── Rework ←────┘
```

| Status           | Who sets it    | What happens                                                |
| ---------------- | -------------- | ----------------------------------------------------------- |
| **Todo**         | Human          | Issue is queued — Symphony picks it up on the next poll     |
| **In Progress**  | Orchestrator   | Agent is working — writing code, running tests              |
| **Agent Review** | Agent or Human | Agent addresses PR review comments                          |
| **Human Review** | Agent          | PR is ready for human approval                              |
| **Merging**      | Human          | Agent merges the approved PR                                |
| **Rework**       | Human          | Agent scraps current approach, starts fresh on a new branch |
| **Done**         | Agent          | Terminal — PR merged, workspace cleaned up                  |

**Linear setup note:** Disable Linear's "auto-close parent when all sub-issues are done" automation. Symphony agents move child issues to Done during execution, but the parent must stay active until the PR lifecycle completes.

### Linear workflow states

The state names in `active_states`, `terminal_states`, `max_concurrent_agents_by_state`, and `model_by_state` must match the workflow state names configured in your Linear team. These are not fixed — every Linear team can have different states.

To see your team's states, go to **Linear → Settings → Teams → [your team] → Workflow** or query the API:

```graphql
query { teams { nodes { name states { nodes { name type } } } } }
```

Symphony's default state configuration assumes this common Linear workflow:

| State          | Type     | Symphony role               |
| -------------- | -------- | --------------------------- |
| `Todo`         | active   | Queued for dispatch         |
| `In Progress`  | active   | Agent is implementing       |
| `Agent Review` | active   | Agent addresses PR feedback |
| `Human Review` | active   | Waiting for human approval  |
| `Merging`      | active   | Agent merges the PR         |
| `Rework`       | active   | Agent restarts from scratch |
| `Done`         | terminal | Work complete               |
| `Closed`       | terminal | Closed without completion   |
| `Cancelled`    | terminal | Cancelled                   |

If your Linear team uses different state names, update `active_states` and `terminal_states` in your WORKFLOW.md to match. State matching is case-insensitive.

### Per-state model selection

When using the Kata CLI backend, you can assign different models to different workflow states. This lets you use expensive models for implementation and cheaper/faster models for mechanical tasks like addressing review comments or merging.

```yaml
kata_agent:
  model: anthropic/claude-opus-4-6          # default for all states
  model_by_state:                           # keys are Linear state names (case-insensitive)
    Agent Review: anthropic/claude-sonnet-4-6
    Merging: anthropic/claude-sonnet-4-6
```

If a state isn't listed, the default `model` is used.

The active model is visible in both the TUI and web dashboard.


## CLI Reference

```
symphony [WORKFLOW.md] [--port PORT] [--logs-root PATH] [--no-tui]
```

| Flag                       | Default       | Description                                                        |
| -------------------------- | ------------- | ------------------------------------------------------------------ |
| `WORKFLOW.md` (positional) | `WORKFLOW.md` | Path to the workflow configuration file                            |
| `--port PORT`              | `8080`        | HTTP dashboard and API port                                        |
| `--logs-root PATH`         | *(none)*      | Directory for rotating log files                                   |
| `--no-tui`                 | `false`       | Disable the terminal dashboard; stream JSON logs to stdout instead |

### Log verbosity

```bash
RUST_LOG=info symphony WORKFLOW.md                    # default
RUST_LOG=debug symphony WORKFLOW.md                   # verbose
RUST_LOG=symphony=trace,info symphony WORKFLOW.md     # trace symphony, info everything else
```

## Configuration Reference

All configuration lives in the YAML front-matter of your WORKFLOW.md. See [`docs/WORKFLOW-REFERENCE.md`](docs/WORKFLOW-REFERENCE.md) for the complete reference with inline comments.

### Key sections

| Section                   | What it controls                                                  |
| ------------------------- | ----------------------------------------------------------------- |
| `tracker`                 | Linear connection, project, assignee filter, state mappings       |
| `polling`                 | How often to check for new/changed issues                         |
| `shared_context`          | Ephemeral cross-worker context retention (TTL + max entries)      |
| `workspace`               | Where and how workspaces are created, Docker config               |
| `agent`                   | Backend selection, concurrency limits, max turns, retry backoff   |
| `kata_agent` / `pi_agent` | Kata CLI backend config: command, model, timeouts                 |
| `codex`                   | Codex backend config: command, timeouts, approval policy, sandbox |
| `hooks`                   | Shell commands to run at workspace lifecycle points               |
| `worker`                  | SSH remote worker pool configuration                              |
| `notifications`           | Slack webhook notifications for events needing human attention    |
| `server`                  | HTTP dashboard host and port                                      |

### Environment variable indirection

Any string value starting with `$` followed by a bare identifier is resolved from the environment at startup:

```yaml
tracker:
  api_key: $LINEAR_API_KEY      # reads LINEAR_API_KEY from env
  assignee: $SYMPHONY_ASSIGNEE  # reads SYMPHONY_ASSIGNEE from env
```

### Dynamic reload

Symphony watches WORKFLOW.md for changes and applies config updates without restart.

## Inter-worker Shared Context

Symphony includes an **ephemeral shared context store** for cross-worker coordination.
Workers automatically receive the most relevant recent entries (project + matching labels)
in their prompt preamble, so follow-up workers can reuse decisions and avoid conflicts.

Properties:

- In-memory only (restarts intentionally clear it)
- Configurable TTL (`shared_context.ttl_ms`, default 24h)
- Configurable cap (`shared_context.max_entries`, default 100)
- Automatic expiry pruning on every poll cycle

HTTP API:

- `POST /api/v1/context` — write `{ author_issue, scope, content, ttl_ms? }`
- `GET /api/v1/context` — list current entries (optional `?scope=project,label:backend`)
- `DELETE /api/v1/context/{id}` — delete one entry
- `DELETE /api/v1/context?scope=...` — clear by scope (or all when omitted)

Events emitted on `/api/v1/events`:

- `event=shared_context_written`
- `event=shared_context_read`
- `event=shared_context_expired`

## Lifecycle Hooks

Shell commands that run at workspace lifecycle events. Work with all git strategies and Docker mode.

```yaml
hooks:
  after_create: ./scripts/setup-workspace.sh
  before_run: echo "Starting $SYMPHONY_ISSUE_IDENTIFIER"
  after_run: ./scripts/collect-artifacts.sh
  before_remove: tar czf /tmp/$SYMPHONY_ISSUE_IDENTIFIER.tar.gz $SYMPHONY_WORKSPACE_PATH
  timeout_ms: 120000
```

| Hook | When it runs |
|---|---|
| `after_create` | After workspace directory is created and repo is bootstrapped |
| `before_run` | Before the agent session starts |
| `after_run` | After the agent session ends (success or failure) |
| `before_remove` | Before workspace is deleted (when `cleanup_on_done: true`) |

All hooks receive these environment variables:

| Variable | Example |
|---|---|
| `SYMPHONY_ISSUE_ID` | Linear issue UUID |
| `SYMPHONY_ISSUE_IDENTIFIER` | `KAT-911` |
| `SYMPHONY_ISSUE_TITLE` | Issue title text |
| `SYMPHONY_WORKSPACE_PATH` | `/Volumes/EVO/symphony-workspaces/KAT-911` |

Hooks run in the workspace directory. If a hook fails, `after_create` and `before_run` abort the worker attempt (the issue retries). `after_run` failures are logged but don't affect the session result.

## Slack Notifications

Symphony can send webhook notifications to Slack on any issue state transition or runtime event.

```yaml
notifications:
  slack:
    webhook_url: $SLACK_WEBHOOK_URL
    events:
      - in_progress      # agent started working
      - agent_review     # agent opened PR, ready for bot review
      - human_review     # PR ready for human approval
      - merging          # human approved, agent merging
      - rework           # human requested changes
      - done             # issue complete
      - stalled          # agent exceeded stall timeout
      - failed           # agent failed after max retries
```

Use `all` to subscribe to every event. Messages include a clickable link to the Linear issue. Notification failures are logged as warnings but never block the orchestrator.

See [`docs/WORKFLOW-slack.md`](docs/WORKFLOW-slack.md) for a complete workflow template with notifications configured.

## SSH Remote Workers

Distribute agent sessions across multiple machines:

```yaml
worker:
  ssh_hosts:
    - worker1.example.com
    - worker2.example.com:2222
    - alice@worker3.example.com
  max_concurrent_agents_per_host: 3
```

Each host must have the agent backend (Kata CLI or Codex) installed and on PATH. Symphony connects via `ssh -T` and spawns the agent remotely. Set `SYMPHONY_SSH_CONFIG` to use a custom SSH config file.

## Dashboard

### Web dashboard

Available at `http://localhost:<port>`. Auto-refreshes every 2 seconds.

Shows: running sessions (with turn count, token usage, last activity), retry queue, shared context table (author/scope/preview/age/TTL), completed issues, polling stats, rate limits, and a link to the Linear project.

HTTP surfaces:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/state` | Full orchestrator snapshot JSON (includes `shared_context` summary) |
| `GET /api/v1/context` | List active shared context entries (optional `scope` filter) |
| `POST /api/v1/context` | Write a shared context entry |
| `DELETE /api/v1/context/{id}` | Delete a specific shared context entry |
| `DELETE /api/v1/context` | Clear shared context (optionally by `scope`) |
| `GET /api/v1/{ISSUE-ID}` | Per-issue running/retry projection |
| `POST /api/v1/refresh` | Queue an immediate poll tick |
| `GET /api/v1/events` | Live websocket stream (`SymphonyEventEnvelope`) |

### Event stream quick check (`/api/v1/events`)

Use [`websocat`](https://github.com/vi/websocat) to verify live worker/runtime traffic:

```bash
websocat "ws://127.0.0.1:8080/api/v1/events?issue=KAT-920&type=worker,tool&severity=info"
```

Filter semantics are **OR within each field** and **AND across fields**:

- `issue=KAT-920,KAT-921` → either issue
- `type=worker,tool` → either event kind
- `severity=warn,error` → either severity
- Combined query requires all provided field filters to match

Connection diagnostics are emitted as structured logs/counters:

- `event=ws_client_connected`
- `event=ws_client_disconnected`
- `event=ws_event_dropped`
- `event=ws_heartbeat_sent`

Disconnect reasons are explicit (`backpressure`, `server_shutdown`, `client_closed`, `protocol_error`).

<details>
<summary>Screenshot</summary>

<img src="../../assets/symphony-v1.0.0/symphony-web.png" alt="HTTP Dashboard" width="600">

</details>

### Terminal dashboard

Enabled by default. Shows a Ratatui-based live view with throughput sparkline and color-coded session status. Disable with `--no-tui` to get JSON log output instead.

## Development

```bash
cargo build              # build
cargo test               # run all tests
cargo clippy -- -D warnings   # lint (zero warnings enforced)
cargo fmt                # format
```

See [AGENTS.md](AGENTS.md) for the full architecture reference, module layout, and test harness details.
