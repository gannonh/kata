# Docker Container Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run worker agents in disposable Docker containers instead of directly on the host, providing full isolation while preserving the existing JSON-RPC communication protocol.

**Architecture:** Symphony spawns Docker containers per-issue using `docker run`, communicates with Codex via `docker exec -i` stdin/stdout pipe (same as SSH model), and destroys containers after sessions complete. Setup scripts are cached as derived Docker image layers.

**Tech Stack:** Rust (tokio, serde), Docker CLI, shell scripts

**Spec:** `apps/symphony/docs/specs/2026-03-22-docker-isolation.md`

---

## File Structure

### New files

| File | Responsibility |
|---|---|
| `src/docker.rs` | Container lifecycle: image resolution, start, exec, stop, availability check |
| `docker/Dockerfile.symphony` | Orchestrator container image (multi-stage Rust build) |
| `docker/Dockerfile.worker` | Base worker image (Node + git + gh + Codex) |
| `docker/docker-compose.yml` | One-command local/VPS deployment |
| `docker/.env.example` | Template for required environment variables |
| `docker/setups/rust.sh` | Rust toolchain setup script |
| `docker/setups/python.sh` | Python 3.12 setup script |
| `docker/setups/go.sh` | Go setup script |
| `docker/setups/bun.sh` | Bun runtime setup script |
| `tests/docker_tests.rs` | Unit tests for docker module (mocked) |

### Modified files

| File | What changes |
|---|---|
| `src/domain.rs` | Add `DockerConfig`, `DockerCodexAuth` structs; add `docker` field to `WorkspaceConfig` |
| `src/config.rs` | Parse `docker:` YAML section; add `RawDockerConfig` |
| `src/lib.rs` | Add `pub mod docker;` |
| `src/codex/app_server.rs` | Add Docker variant in `start_session` alongside Local and SSH |
| `src/workspace.rs` | Docker path for `bootstrap_repository` and hooks (via `docker exec`) |
| `src/orchestrator.rs` | Docker container lifecycle in `run_worker_task` |
| `src/error.rs` | Add Docker-specific error variants |
| `apps/symphony/Cargo.toml` | No new deps needed (uses `tokio::process::Command` for docker CLI) |

---

### Task 1: Domain types and config parsing

**Files:**
- Modify: `src/domain.rs`
- Modify: `src/config.rs`
- Modify: `src/error.rs`
- Test: `tests/workflow_config_tests.rs`

- [ ] **Step 1: Add Docker domain types to `src/domain.rs`**

After `WorkspaceIsolation` enum, add:

```rust
/// Codex authentication mode for Docker containers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DockerCodexAuth {
    /// OPENAI_API_KEY env var if set, else mount auth.json, else error.
    Auto,
    /// Force bind-mount of ~/.codex/auth.json (local only).
    Mount,
    /// Force OPENAI_API_KEY env var only (cloud deployments).
    Env,
}

/// Docker-specific workspace configuration.
#[derive(Debug, Clone)]
pub struct DockerConfig {
    /// Docker image name (e.g. "symphony-worker:latest").
    pub image: String,
    /// Optional setup script path, cached as derived image layer.
    pub setup: Option<String>,
    /// How to authenticate Codex inside the container.
    pub codex_auth: DockerCodexAuth,
    /// Additional environment variables passed to the container.
    pub env: Vec<String>,
    /// Additional read-only volume mounts (e.g. "~/.ssh:/root/.ssh:ro").
    pub volumes: Vec<String>,
}

impl Default for DockerConfig {
    fn default() -> Self {
        Self {
            image: "symphony-worker:latest".to_string(),
            setup: None,
            codex_auth: DockerCodexAuth::Auto,
            env: vec![],
            volumes: vec![],
        }
    }
}
```

Add `docker: Option<DockerConfig>` field to `WorkspaceConfig`. Update `Default` impl to set `docker: None`.

- [ ] **Step 2: Add Docker error variants to `src/error.rs`**

```rust
DockerNotAvailable,
DockerContainerFailed(String),
DockerImageBuildFailed(String),
DockerAuthError(String),
```

- [ ] **Step 3: Add raw config struct and parsing in `src/config.rs`**

Add `RawDockerConfig`:

```rust
#[derive(Deserialize, Default)]
#[serde(default)]
struct RawDockerConfig {
    image: Option<String>,
    setup: Option<String>,
    codex_auth: Option<String>,
    env: Option<Vec<String>>,
    volumes: Option<Vec<String>>,
}
```

Add `docker: Option<RawDockerConfig>` to `RawWorkspaceConfig`.

Parse in the workspace config section. When `isolation == Docker`, require docker config (use defaults if section absent). Remove the existing "not yet implemented" warning for Docker isolation.

Parse `codex_auth`: `"auto"` | `"mount"` | `"env"`, default `"auto"`.

- [ ] **Step 4: Write config parsing tests**

In `tests/workflow_config_tests.rs`:

```rust
#[test]
fn test_docker_isolation_parses_with_defaults() { ... }

#[test]
fn test_docker_isolation_parses_full_config() { ... }

#[test]
fn test_docker_codex_auth_values() { ... }

#[test]
fn test_docker_config_absent_when_local_isolation() { ... }
```

- [ ] **Step 5: Run tests and commit**

```bash
cargo test --test workflow_config_tests
cargo clippy -- -D warnings
git add src/domain.rs src/config.rs src/error.rs tests/workflow_config_tests.rs
git commit -m "feat(symphony): add DockerConfig domain types and config parsing (KAT-821)"
```

---

### Task 2: Docker module — container lifecycle

**Files:**
- Create: `src/docker.rs`
- Modify: `src/lib.rs`
- Test: `tests/docker_tests.rs`

- [ ] **Step 1: Create `src/docker.rs` with availability check**

```rust
use std::process::Stdio;
use tokio::process::Command;
use crate::error::{Result, SymphonyError};

/// Check if Docker daemon is reachable.
pub async fn is_docker_available() -> bool {
    Command::new("docker")
        .args(["info", "--format", "{{.ServerVersion}}"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}
```

- [ ] **Step 2: Add `pub mod docker;` to `src/lib.rs`**

- [ ] **Step 3: Add image resolution and derived image caching**

```rust
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Resolve the effective Docker image. If a setup script is configured,
/// build a derived image with the setup script as a RUN layer.
pub async fn resolve_image(
    base_image: &str,
    setup_script: Option<&str>,
) -> Result<String> { ... }

/// Compute a deterministic tag for a derived image from the setup script content.
fn derived_image_tag(base_image: &str, setup_content: &str) -> String { ... }

/// Check if a Docker image exists locally.
async fn image_exists(tag: &str) -> bool { ... }

/// Build a derived image: base + RUN <setup script>.
async fn build_derived_image(base_image: &str, setup_content: &str, tag: &str) -> Result<()> { ... }
```

- [ ] **Step 4: Add container start/stop**

```rust
use crate::domain::{DockerCodexAuth, DockerConfig, Issue};

/// Start a Docker container for a worker session.
/// Returns the container ID.
pub async fn start_container(
    image: &str,
    issue: &Issue,
    config: &DockerConfig,
    env_vars: &[(&str, &str)],  // LINEAR_API_KEY, GH_TOKEN, etc.
) -> Result<String> { ... }

/// Stop and remove a Docker container.
pub async fn stop_container(container_id: &str) -> Result<()> { ... }

/// Build a `tokio::process::Command` for `docker exec -i <container> <cmd>`.
pub fn exec_command(container_id: &str, cmd: &str) -> Command { ... }

/// Run a command inside the container and wait for completion.
pub async fn exec_in_container(container_id: &str, cmd: &str) -> Result<String> { ... }
```

- [ ] **Step 5: Add auth resolution**

```rust
/// Resolve Codex auth arguments for container start.
/// Returns (env_vars, volume_mounts) to add to docker run.
pub fn resolve_codex_auth(
    auth_mode: DockerCodexAuth,
) -> Result<(Vec<(String, String)>, Vec<String>)> { ... }
```

Logic:
- `Auto`: check `OPENAI_API_KEY` env → if set, pass as env var. Else check `~/.codex/auth.json` → if exists, mount. Else error.
- `Mount`: mount `~/.codex/auth.json` or error if missing.
- `Env`: require `OPENAI_API_KEY` or error.

- [ ] **Step 6: Write unit tests**

Create `tests/docker_tests.rs`:

```rust
#[test]
fn test_derived_image_tag_is_deterministic() { ... }

#[test]
fn test_derived_image_tag_changes_with_content() { ... }

#[test]
fn test_resolve_codex_auth_auto_with_api_key() { ... }

#[test]
fn test_resolve_codex_auth_auto_with_auth_json() { ... }

#[test]
fn test_resolve_codex_auth_auto_neither_errors() { ... }

#[test]
fn test_resolve_codex_auth_mount_missing_errors() { ... }

#[test]
fn test_resolve_codex_auth_env_missing_errors() { ... }

#[test]
fn test_exec_command_builds_correct_args() { ... }

#[test]
fn test_container_name_from_issue() { ... }
```

- [ ] **Step 7: Run tests and commit**

```bash
cargo test --test docker_tests
cargo clippy -- -D warnings
git add src/docker.rs src/lib.rs tests/docker_tests.rs
git commit -m "feat(symphony): add docker module — container lifecycle and auth (KAT-821)"
```

---

### Task 3: Wire Docker into app_server session spawning

**Files:**
- Modify: `src/codex/app_server.rs`

- [ ] **Step 1: Add Docker variant to `start_session`**

In `start_session`, the `match worker_host` block currently has `None` (local) and `Some(host)` (SSH). Add a new parameter or check `isolation` from the config. The cleanest approach: add an `isolation: &WorkspaceIsolation` parameter and an optional `container_id: Option<&str>`.

When `isolation == Docker` and `container_id` is `Some(id)`:

```rust
Some(container_id) if isolation == &WorkspaceIsolation::Docker => {
    let workspace_str = workspace_path.to_string_lossy().to_string();

    tracing::info!(
        container_id = %container_id,
        issue_id = %issue.id,
        cmd = %cmd_str,
        "Spawning Codex via Docker exec"
    );

    let remote_cmd = format!(
        "cd {} && {}",
        crate::ssh::shell_escape(&workspace_str),
        cmd_str
    );
    let child = crate::docker::exec_command(container_id, &remote_cmd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| SymphonyError::DockerContainerFailed(e.to_string()))?;

    (workspace_str, child)
}
```

- [ ] **Step 2: Update `start_session` signature**

Add `container_id: Option<&str>` parameter. All existing callers pass `None` for non-Docker mode.

- [ ] **Step 3: Update all callers of `start_session`**

In `run_worker_task` and `execute_worker_attempt`, pass `None` for container_id when not in Docker mode.

- [ ] **Step 4: Run tests and commit**

```bash
cargo test
cargo clippy -- -D warnings
git add src/codex/app_server.rs src/orchestrator.rs
git commit -m "feat(symphony): wire Docker exec into app_server session spawning (KAT-821)"
```

---

### Task 4: Wire Docker into workspace setup and worker task

**Files:**
- Modify: `src/workspace.rs`
- Modify: `src/orchestrator.rs`

- [ ] **Step 1: Add Docker workspace setup path**

In `workspace.rs`, add a function for Docker workspace bootstrap:

```rust
/// Bootstrap repository inside a Docker container.
pub async fn docker_bootstrap_repository(
    container_id: &str,
    config: &WorkspaceConfig,
    issue_identifier: &str,
) -> Result<()> {
    let repo = config.repo.as_deref().ok_or_else(|| {
        SymphonyError::InvalidWorkflowConfig("workspace.repo required for docker isolation".into())
    })?;

    let branch_name = format!("{}/{}", config.branch_prefix, issue_identifier);

    // Clone inside container
    let clone_cmd = if let Some(clone_branch) = config.clone_branch.as_deref() {
        format!("git clone {} /workspace --branch {} && cd /workspace && git checkout -b {}", repo, clone_branch, branch_name)
    } else {
        format!("git clone {} /workspace && cd /workspace && git checkout -b {}", repo, branch_name)
    };

    docker::exec_in_container(container_id, &clone_cmd).await?;
    Ok(())
}
```

- [ ] **Step 2: Add Docker hook execution**

```rust
/// Run a hook command inside a Docker container.
pub async fn run_hook_in_container(
    container_id: &str,
    hook_cmd: &str,
    issue: &Issue,
    timeout_ms: u64,
) -> Result<()> { ... }
```

Set hook env vars (`SYMPHONY_ISSUE_ID`, etc.) via the docker exec command.

- [ ] **Step 3: Add Docker path to `run_worker_task` in `orchestrator.rs`**

Before the existing workspace/session flow, add:

```rust
if config.workspace.isolation == WorkspaceIsolation::Docker {
    let docker_config = config.workspace.docker.as_ref()
        .unwrap_or(&DockerConfig::default());

    // 1. Check Docker available
    if !docker::is_docker_available().await {
        return WorkerResult { ... Failed: "Docker not available" };
    }

    // 2. Resolve image (with setup script caching)
    let image = docker::resolve_image(&docker_config.image, docker_config.setup.as_deref()).await?;

    // 3. Start container
    let env_vars = [
        ("LINEAR_API_KEY", std::env::var("LINEAR_API_KEY").unwrap_or_default()),
        ("GH_TOKEN", std::env::var("GH_TOKEN").unwrap_or_default()),
    ];
    let container_id = docker::start_container(&image, issue, docker_config, &env_vars).await?;

    // 4. Bootstrap workspace inside container
    workspace::docker_bootstrap_repository(&container_id, &config.workspace, &issue.identifier).await?;

    // 5. Run before_run hook inside container
    if let Some(hook) = &config.hooks.before_run {
        workspace::run_hook_in_container(&container_id, hook, issue, config.hooks.timeout_ms).await?;
    }

    // 6. Start Codex session via docker exec
    let session = app_server::start_session(
        &config.codex, issue, Path::new("/workspace"), Path::new("/"),
        None,  // no SSH host
        Some(&container_id),  // Docker container
    ).await?;

    // 7. Multi-turn loop (unchanged)
    // ... existing turn loop code ...

    // 8. Stop container
    docker::stop_container(&container_id).await?;

    return WorkerResult { ... };
}
// ... existing local/SSH path unchanged ...
```

- [ ] **Step 4: Run tests and commit**

```bash
cargo test
cargo clippy -- -D warnings
git add src/workspace.rs src/orchestrator.rs
git commit -m "feat(symphony): wire Docker lifecycle into worker task and workspace setup (KAT-821)"
```

---

### Task 5: Docker files — Dockerfiles, compose, setup scripts

**Files:**
- Create: `docker/Dockerfile.symphony`
- Create: `docker/Dockerfile.worker`
- Create: `docker/docker-compose.yml`
- Create: `docker/.env.example`
- Create: `docker/setups/rust.sh`
- Create: `docker/setups/python.sh`
- Create: `docker/setups/go.sh`
- Create: `docker/setups/bun.sh`

- [ ] **Step 1: Create `docker/Dockerfile.worker`**

```dockerfile
FROM node:22-slim
RUN apt-get update && apt-get install -y git curl && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh && rm -rf /var/lib/apt/lists/*
RUN npm install -g @openai/codex
WORKDIR /workspace
```

- [ ] **Step 2: Create `docker/Dockerfile.symphony`**

```dockerfile
FROM rust:slim AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY src/ src/
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://get.docker.com | sh  # installs docker-cli
COPY --from=builder /build/target/release/symphony /usr/local/bin/symphony
WORKDIR /app
ENTRYPOINT ["symphony"]
CMD ["WORKFLOW.md", "--port", "8080"]
```

- [ ] **Step 3: Create `docker/docker-compose.yml`**

```yaml
version: "3.8"

services:
  symphony:
    build:
      context: ..
      dockerfile: docker/Dockerfile.symphony
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../WORKFLOW.md:/app/WORKFLOW.md:ro
    env_file: .env
    ports:
      - "8080:8080"
    restart: unless-stopped

  worker:
    build:
      context: ..
      dockerfile: docker/Dockerfile.worker
    profiles: ["build-only"]
```

- [ ] **Step 4: Create `docker/.env.example`**

```bash
# Required
LINEAR_API_KEY=lin_api_...
OPENAI_API_KEY=sk-...

# Optional — for GitHub PR operations
GH_TOKEN=ghp_...
GITHUB_TOKEN=ghp_...
```

- [ ] **Step 5: Create setup scripts**

`docker/setups/rust.sh`:
```bash
#!/bin/bash
set -euo pipefail
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
echo 'source $HOME/.cargo/env' >> ~/.bashrc
```

`docker/setups/python.sh`:
```bash
#!/bin/bash
set -euo pipefail
apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*
```

`docker/setups/go.sh`:
```bash
#!/bin/bash
set -euo pipefail
GO_VERSION=$(curl -sL 'https://go.dev/VERSION?m=text' | head -1)
curl -sL "https://go.dev/dl/${GO_VERSION}.linux-$(dpkg --print-architecture).tar.gz" | tar -C /usr/local -xz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
```

`docker/setups/bun.sh`:
```bash
#!/bin/bash
set -euo pipefail
curl -fsSL https://bun.sh/install | bash
echo 'export PATH=$HOME/.bun/bin:$PATH' >> ~/.bashrc
```

- [ ] **Step 6: Commit**

```bash
git add docker/
git commit -m "feat(symphony): add Docker files — worker image, compose, setup scripts (KAT-821)"
```

---

### Task 6: Documentation and WORKFLOW.md reference update

**Files:**
- Modify: `apps/symphony/README.md`
- Modify: `apps/symphony/docs/WORKFLOW-REFERENCE.md`
- Modify: `apps/symphony/AGENTS.md`

- [ ] **Step 1: Update README with Docker deployment section**

Add a "Docker Deployment" section covering:
- Local: `docker compose up`
- VPS: clone, configure, `docker compose up -d`
- Custom worker images via setup scripts
- Auth configuration

- [ ] **Step 2: Update WORKFLOW-REFERENCE.md**

Add the `docker:` config section with all fields documented.

- [ ] **Step 3: Update AGENTS.md**

Add `docker.rs` to the module listing. Document the Docker container lifecycle.

- [ ] **Step 4: Commit**

```bash
git add apps/symphony/README.md apps/symphony/docs/WORKFLOW-REFERENCE.md apps/symphony/AGENTS.md
git commit -m "docs(symphony): Docker deployment documentation (KAT-821)"
```

---

### Task 7: Integration test (gated)

**Files:**
- Create: `tests/docker_integration_tests.rs`

- [ ] **Step 1: Write integration test gated behind env var**

```rust
//! Integration tests for Docker container isolation.
//! Requires Docker daemon running and SYMPHONY_DOCKER_TESTS=1.

#[cfg(test)]
mod tests {
    fn docker_tests_enabled() -> bool {
        std::env::var("SYMPHONY_DOCKER_TESTS").unwrap_or_default() == "1"
    }

    #[tokio::test]
    async fn test_docker_available() {
        if !docker_tests_enabled() { return; }
        assert!(symphony::docker::is_docker_available().await);
    }

    #[tokio::test]
    async fn test_start_and_stop_container() {
        if !docker_tests_enabled() { return; }
        // ... start container, verify running, stop, verify removed
    }

    #[tokio::test]
    async fn test_exec_in_container() {
        if !docker_tests_enabled() { return; }
        // ... start container, exec "echo hello", verify output
    }

    #[tokio::test]
    async fn test_auth_resolution_auto() {
        if !docker_tests_enabled() { return; }
        // ... verify auth env/mount args
    }
}
```

- [ ] **Step 2: Run unit tests (always) and integration tests (if Docker available)**

```bash
cargo test
cargo clippy -- -D warnings
# Optional: SYMPHONY_DOCKER_TESTS=1 cargo test --test docker_integration_tests
git add tests/docker_integration_tests.rs
git commit -m "test(symphony): Docker integration tests (KAT-821)"
```

---

## Task summary

| Task | Description | Est |
|---|---|---|
| 1 | Domain types + config parsing | 15 min |
| 2 | Docker module — container lifecycle | 30 min |
| 3 | Wire into app_server session | 15 min |
| 4 | Wire into workspace + worker task | 25 min |
| 5 | Docker files (Dockerfiles, compose, scripts) | 15 min |
| 6 | Documentation | 10 min |
| 7 | Integration tests | 10 min |
