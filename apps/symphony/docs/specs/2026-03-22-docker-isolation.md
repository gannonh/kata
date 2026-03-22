# Docker Container Isolation for Symphony Workers

**Date:** 2026-03-22
**Ticket:** KAT-821
**Status:** Approved design

## Problem

Worker agents currently run with full host access (`danger-full-access` sandbox) because Codex's built-in sandbox prevents network sockets needed for testing. The production model: each worker runs in a disposable Docker container with full access inside the container, completely isolated from the host.

## Goals

- **Local safety** — agents can't touch host filesystem
- **Cloud deployment** — run Symphony on a VPS with `docker compose up`
- **DX** — one command to start, bundled setup scripts for common stacks

## Architecture

Symphony's orchestrator stays on the host (or in its own container). When `isolation: docker`, it spawns a Docker container per issue instead of a local subprocess. Communication uses `docker exec -i` piping stdin/stdout — identical to the SSH worker model. Same JSON-RPC protocol, same event streaming, same multi-turn loop.

```
Orchestrator (host or container)
    │
    ├── docker exec -i worker-KAT-123 codex app-server
    │       └── stdin/stdout JSON-RPC (same as local/SSH)
    │
    ├── docker exec -i worker-KAT-456 codex app-server
    │       └── stdin/stdout JSON-RPC
    │
    └── ... (up to max_concurrent_agents)
```

### Process spawning abstraction

```
WorkerHostSelection::Local      → Command::new("codex")
WorkerHostSelection::Remote(h)  → Command::new("ssh").args([h, "codex"])
WorkerHostSelection::Docker(c)  → Command::new("docker").args(["exec", "-i", c, "codex"])
```

Same interface, different transport. Adding future backends (K8s, ECS) is another variant.

## Container Lifecycle

```
1. Resolve image
   - Base image + setup script → check for cached derived image
   - No cache → docker build (setup script as RUN layer), tag as symphony-worker-<hash>
   - Cached → use it

2. Start container
   - docker run --rm -d --name symphony-<issue-identifier>
   - Auth: OPENAI_API_KEY env var OR mount ~/.codex/auth.json:ro
   - Env: LINEAR_API_KEY, GH_TOKEN, GITHUB_TOKEN + user-configured env
   - Volumes: user-configured read-only mounts (e.g. ~/.ssh)
   - Network: full access (default bridge)

3. Workspace setup (inside container)
   - git clone <repo> /workspace
   - git checkout -b <branch_prefix>/<identifier>
   - hooks.after_create runs inside container

4. Agent session
   - docker exec -i <container> codex app-server
   - Symphony communicates via stdin/stdout JSON-RPC
   - Multi-turn loop runs normally
   - Events stream back to orchestrator

5. Cleanup
   - hooks.after_run inside container
   - docker rm -f (container destroyed)
   - Derived image stays cached for next run
```

## Auth Resolution

Order of precedence:

1. `OPENAI_API_KEY` env var set → pass into container as env var (API key auth)
2. `~/.codex/auth.json` exists on host → mount read-only into container (ChatGPT subscription auth)
3. Neither → error at container start: "Codex auth required: set OPENAI_API_KEY or authenticate via `codex auth`"

Config option:
- `codex_auth: auto` (default) — follow the resolution order above
- `codex_auth: mount` — force auth.json mount (local only)
- `codex_auth: env` — force OPENAI_API_KEY only (cloud deployments)

## Images and Setup Scripts

### Tiered approach

| Layer | What it provides | When it runs |
|---|---|---|
| **Base image** | OS, git, gh, Node, Codex | Pulled once |
| **Setup script** | Project-specific runtimes (Rust, Python, etc.) | Cached as derived image layer |
| **after_create hook** | Per-container deps (`bun install`, `cargo build`) | Every container |

### Base image (`docker/Dockerfile.worker`)

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y git gh curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex
WORKDIR /workspace
```

~200MB. Just enough to run Codex with git and GitHub CLI.

### Bundled setup scripts (`docker/setups/`)

| Script | Installs |
|---|---|
| `rust.sh` | Rust stable toolchain, cargo |
| `python.sh` | Python 3.12, pip, venv |
| `go.sh` | Go latest |
| `bun.sh` | Bun runtime |

Users can combine: `setup: "docker/setups/rust.sh && docker/setups/bun.sh"`

### Derived image caching

When `docker.setup` is configured, Symphony:
1. Hashes the setup script content
2. Checks for existing image tagged `symphony-worker-<hash>`
3. If missing, builds: base image + `RUN <setup script>` → tags as derived image
4. Uses derived image for all containers

First run is slow (builds the image). Subsequent runs are instant.

## Configuration

```yaml
workspace:
  root: ~/symphony-workspaces
  repo: https://github.com/you/repo.git
  git_strategy: clone-remote
  isolation: docker
  branch_prefix: symphony
  clone_branch: main
  cleanup_on_done: true
  docker:
    image: "symphony-worker:latest"
    setup: "docker/setups/rust.sh"
    codex_auth: auto
    env:
      - CARGO_HOME=/usr/local/cargo
    volumes:
      - ~/.ssh:/root/.ssh:ro
```

## Docker Compose

### `docker-compose.yml`

```yaml
version: "3.8"

services:
  symphony:
    build:
      context: .
      dockerfile: docker/Dockerfile.symphony
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./WORKFLOW.md:/app/WORKFLOW.md:ro
    env_file: .env
    ports:
      - "8080:8080"
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: docker/Dockerfile.worker
    profiles: ["build-only"]
```

### `docker/Dockerfile.symphony`

```dockerfile
FROM rust:slim AS builder
WORKDIR /build
COPY apps/symphony/ .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates docker-cli && rm -rf /var/lib/apt/lists/*
COPY --from=builder /build/target/release/symphony /usr/local/bin/symphony
WORKDIR /app
ENTRYPOINT ["symphony"]
CMD ["WORKFLOW.md", "--port", "8080"]
```

Symphony container mounts the Docker socket to spawn sibling worker containers.

### Usage

```bash
# Local
echo "LINEAR_API_KEY=lin_api_..." > .env
echo "OPENAI_API_KEY=sk-..." >> .env
echo "GH_TOKEN=ghp_..." >> .env
docker compose build
docker compose up

# VPS
git clone https://github.com/gannonh/kata.git
cd kata/apps/symphony
cp .env.example .env  # edit with your keys
docker compose up -d
```

## Implementation

### New module: `src/docker.rs`

Container lifecycle manager:
- `build_or_resolve_image(config)` — check for cached derived image, build if needed
- `start_container(image, issue, env, volumes, auth)` — `docker run --rm -d`, returns container ID
- `exec_codex(container_id, codex_command)` → `tokio::process::Command`
- `exec_in_container(container_id, command)` — run arbitrary commands inside container
- `stop_container(container_id)` — `docker rm -f`
- `is_docker_available()` — check if Docker daemon is reachable

### Changes to `src/codex/app_server.rs`

`start_session` gains an isolation parameter:
```rust
match isolation {
    Local => Command::new(&codex_command),
    Docker(container_id) => docker::exec_codex(&container_id, &codex_command),
}
```

### Changes to `src/workspace.rs`

`bootstrap_repository` in Docker mode runs git commands inside the container via `docker::exec_in_container`. Hooks also run inside the container.

### Changes to `src/orchestrator.rs`

`run_worker_task` gains a Docker path:
```rust
if config.workspace.isolation == Docker {
    let container_id = docker::start_container(...)?;
    docker::exec_workspace_setup(&container_id, ...)?;
    // session uses docker exec
    ...
    docker::stop_container(&container_id);
}
```

### Config changes: `src/domain.rs` + `src/config.rs`

```rust
pub struct DockerConfig {
    pub image: String,
    pub setup: Option<String>,
    pub codex_auth: DockerCodexAuth,
    pub env: Vec<String>,
    pub volumes: Vec<String>,
}

pub enum DockerCodexAuth {
    Auto,
    Mount,
    Env,
}
```

### New files

```
docker/
  Dockerfile.symphony
  Dockerfile.worker
  docker-compose.yml
  .env.example
  setups/
    rust.sh
    python.sh
    go.sh
    bun.sh
```

### Tests

- Config parsing: docker section with all fields
- Auth resolution: auto/mount/env logic
- Container lifecycle: mock docker commands, verify correct args
- Image caching: setup script hash → derived image tag
- Integration: actual docker run/exec/rm (gated behind `SYMPHONY_DOCKER_TESTS=1`)

## What does NOT change

- JSON-RPC protocol
- Multi-turn loop
- Event streaming
- Dashboard (shows container name in workspace column)
- SSH workers (coexists)
- Linear integration

## Deployment models

| Model | How it works | MVP? |
|---|---|---|
| **Local Docker** | Symphony on host, workers in containers | ✅ |
| **VPS** | Symphony + Docker on a VPS, `docker compose up` | ✅ |
| **Remote Docker host** | `DOCKER_HOST` env var pointing to remote daemon | Works but untested |
| **Kubernetes** | Future `isolation: kubernetes` variant | ❌ Post-MVP |
| **Cloud containers (ECS, Fly, Modal)** | Future variants with cloud-specific APIs | ❌ Post-MVP |

## Security notes

- Docker socket mount gives Symphony full Docker control on the host. For production, consider a Docker socket proxy.
- Containers have full network access by default. Restrict with `docker.network` config if needed (future).
- `OPENAI_API_KEY` is passed as env var — visible in `docker inspect`. Use Docker secrets for higher security (future).
