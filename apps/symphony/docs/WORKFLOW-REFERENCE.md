---
# ═══════════════════════════════════════════════════════════════════════════════
# Symphony WORKFLOW.md — Orchestrator Configuration + Agent Prompt Template
# ═══════════════════════════════════════════════════════════════════════════════
#
# This file serves two purposes:
#   1. YAML front-matter: parsed by Symphony as runtime configuration
#   2. Markdown body: rendered as the Liquid prompt template for each agent session
#
# Symphony watches this file for changes and applies config updates without
# requiring a process restart.
#
# Environment variable indirection: any string value starting with `$` followed
# by a bare identifier (no `/`, spaces, or `:`) is resolved from the process
# environment at startup. Example: `$LINEAR_API_KEY` reads env var LINEAR_API_KEY.
# Unset variables resolve to empty string with a warning.
# ═══════════════════════════════════════════════════════════════════════════════

# ─── Tracker ──────────────────────────────────────────────────────────────────
# Configures which issue tracker to poll and how to filter issues.
tracker:
  # Tracker backend. Currently only "linear" is supported.
  kind: linear

  # Linear personal API key. Use $VAR indirection to avoid committing secrets.
  api_key: $LINEAR_API_KEY

  # Linear project URL slug or slugId. Found in the project URL:
  # https://linear.app/<workspace>/project/<slug>
  project_slug: "89d4761fddf0"

  # Optional: Linear workspace slug for dashboard project links.
  # When omitted, Symphony falls back to "kata-sh".
  # workspace_slug: kata-sh

  # Optional: Linear GraphQL endpoint. Override for self-hosted Linear.
  # endpoint: https://api.linear.app/graphql

  # Optional: filter candidate issues to this Linear username.
  # When set, only issues assigned to this user are dispatched.
  # When omitted, ALL issues in the project matching active_states are eligible.
  # Supports $VAR indirection.
  # assignee: alice

  # Issue states eligible for dispatch. Issues in these states are candidates
  # for agent work. The orchestrator polls for issues in these states.
  # Default parser value: ["Todo", "In Progress"].
  # This template extends that set so the agent can run full review/merge loops.
  active_states:
    - Todo
    - In Progress
    - Agent Review
    - Merging
    - Rework

  # Issue states that mark work as complete. Issues reaching these states are
  # removed from the running/retry sets and counted as completed.
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done

# ─── Polling ──────────────────────────────────────────────────────────────────
# Controls how frequently Symphony polls the tracker for new/changed issues.
polling:
  # Milliseconds between poll cycles. Lower = more responsive, more API calls.
  interval_ms: 30000

# ─── Workspace ────────────────────────────────────────────────────────────────
# Configures how agent workspaces are created and managed.
# Each dispatched issue gets its own workspace directory.
workspace:
  # Root directory for all workspaces. Each issue gets a subdirectory.
  # Supports ~ tilde expansion and $VAR indirection.
  root: ~/symphony-workspaces

  # Repository to bootstrap into each workspace. Can be:
  #   - A remote URL (https:// or git@): cloned from the remote
  #   - A local path: cloned locally (fast, hard-links .git objects)
  # Supports $VAR indirection and ~ tilde expansion.
  repo: https://github.com/gannonh/kata.git

  # Git bootstrap strategy (replaces the old `strategy` field):
  #   - "auto" (default): clone-remote if repo is a URL, clone-local if repo is a local path
  #   - "clone-local": `git clone --local <path> .` — fast (hard-links), inherits remotes
  #   - "clone-remote": `git clone <url> . --single-branch` — full network clone
  #   - "worktree": `git worktree add` from the source repo
  #     - Requires `repo` to be a local path
  #     - Lightweight — shares .git objects with source
  #     - Cleanup runs `git worktree remove`
  #
  # The old `strategy: clone | worktree` field is still accepted with a
  # deprecation warning. `clone` maps to `auto`, `worktree` stays `worktree`.
  # If both `strategy` and `git_strategy` are set, `git_strategy` wins.
  git_strategy: auto

  # Workspace isolation mode:
  #   - "local" (default): run agent directly on the host
  #   - "docker": run agent in an ephemeral container
  # Docker mode requires git_strategy "auto" or "clone-remote" (clone-local and
  # worktree need host filesystem access). repo must be a remote URL.
  isolation: local

  # Prefix for auto-created issue branches: <prefix>/<issue-identifier>
  # Example: symphony/KAT-814
  branch_prefix: symphony

  # Branch to clone/base off for clone-based strategies.
  # When set, clone uses `--branch <clone_branch>`.
  # When omitted, clone uses the repo's default branch.
  # Supports $VAR indirection.
  clone_branch: main

  # Base branch for workflow merge/rebase/pull operations.
  # Prompt instructions can reference this as `{{ workspace.base_branch }}`.
  # Default: main.
  base_branch: main

  # Whether to auto-remove workspaces when their issue reaches a terminal state.
  # When true, runs `before_remove` hook then deletes the workspace directory.
  # Default: false (workspaces persist for debugging).
  # cleanup_on_done: false

  # Docker-specific options (used when `workspace.isolation: docker`).
  # If omitted, these defaults are applied automatically.
  docker:
    # Base image used for worker containers.
    # Bundled worker image defaults to non-root user `node` (home `/home/node`).
    # Default: symphony-worker:latest
    image: symphony-worker:latest

    # Optional setup script path on the host. Symphony hashes the script
    # content and caches a derived image layer.
    # setup: docker/setups/rust.sh

    # Codex auth mode inside the worker container.
    # Interactive browser login is not available inside containers —
    # use OPENAI_API_KEY in .env or mount an existing auth file.
    #   - auto  (default): OPENAI_API_KEY if set, else stage host ~/.codex/auth.json to $HOME/.codex/auth.json in-container
    #   - env:   force OPENAI_API_KEY (simplest for Docker)
    #   - mount: force host ~/.codex/auth.json -> $HOME/.codex/auth.json in-container
    # codex_auth: auto

    # Extra env vars passed at `docker run` time.
    # env:
    #   - CARGO_HOME=/usr/local/cargo

    # Extra bind mounts passed at `docker run` time.
    # volumes:
    #   - ~/.ssh:/home/node/.ssh:ro

# ─── Hooks ────────────────────────────────────────────────────────────────────
# Shell commands run at workspace lifecycle events. All hooks receive these
# environment variables:
#   SYMPHONY_ISSUE_ID          — Linear issue UUID
#   SYMPHONY_ISSUE_IDENTIFIER  — e.g. KAT-814
#   SYMPHONY_ISSUE_TITLE       — issue title text
#   SYMPHONY_WORKSPACE_PATH    — absolute path to the workspace directory
hooks:
  # Timeout for each hook invocation in milliseconds.
  timeout_ms: 120000

  # Run after workspace directory is created (after git bootstrap).
  # after_create: echo "Workspace created for $SYMPHONY_ISSUE_IDENTIFIER"

  # Run before the Codex session starts.
  # before_run: echo "Starting session"

  # Run after the Codex session ends (success or failure).
  # after_run: echo "Session complete"

  # Run before workspace directory is removed (cleanup_on_done or manual).
  # before_remove: echo "Cleaning up $SYMPHONY_ISSUE_IDENTIFIER"

# ─── Agent ────────────────────────────────────────────────────────────────────
# Controls agent session behavior and concurrency.
agent:
  # Maximum number of agent sessions running simultaneously.
  # New dispatches are held until a slot opens.
  # Default parser value: 10.
  max_concurrent_agents: 1

  # Maximum turns (Codex interactions) per session before the run is
  # considered complete for a single worker attempt.
  max_turns: 20

  # Maximum exponential back-off delay (ms) between retries on failure.
  # max_retry_backoff_ms: 300000

  # Runtime backend for worker sessions.
  #   - kata-cli (alias: kata): launch Kata CLI in RPC mode
  #   - codex: launch Codex app-server
  backend: kata-cli



# ─── Codex ────────────────────────────────────────────────────────────────────
# Configures the Codex app-server process (used when `agent.backend: codex`).
codex:
  # Command to start Codex. Can be a string (whitespace-split) or list.
  # Default parser value: `codex app-server`.
  command: codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh --model gpt-5.3-codex app-server

  # Hard timeout per Codex turn in milliseconds (default: 3600000 = 1 hour).
  # turn_timeout_ms: 3600000

  # Time (ms) before a non-progressing session is considered stalled.
  # Reset on each agent event. Set high for long builds (e.g. cargo test).
  # Default parser value: 300000.
  stall_timeout_ms: 900000

  # Timeout waiting for Codex process output in milliseconds.
  # read_timeout_ms: 5000

  # Approval policy for sandbox actions.
  # Default parser value: reject sandbox/rules/MCP elicitations.
  # `never` enables unattended auto-approval behavior for this workflow.
  approval_policy: never

  # Sandbox mode for the agent thread.
  # Default parser value: workspace-write.
  thread_sandbox: danger-full-access

  # Per-turn sandbox policy override.
  # Default parser value: unset.
  turn_sandbox_policy:
    type: dangerFullAccess

# ─── Kata Agent (Kata RPC) ────────────────────────────────────────────────────
# Configures Kata RPC runtime (used when `agent.backend: kata-cli`; alias: kata).
kata_agent:  # alias: pi_agent
  # Command used to launch Kata RPC. Can be a string or list.
  # Symphony appends --mode rpc --cwd <workspace> automatically.
  # Default parser value: `kata`
  command: kata # or: npx @kata-sh/cli

  # Model passed via `--model`. Format: provider/model-id or just model-id.
  model: anthropic/claude-opus-4-6

  # Per-state model overrides. Keys are Linear state names (case-insensitive).
  # If a state isn't listed, falls back to `model` above.
  # model_by_state:
  #   Agent Review: anthropic/claude-sonnet-4-6
  #   Merging: anthropic/claude-sonnet-4-6

  # Whether to pass `--no-session` to Kata (default: true).
  no_session: true

  # Optional file path passed via `--append-system-prompt`.
  # append_system_prompt: /absolute/path/to/prompt.md

  # Timeout waiting for stdout lines in milliseconds.
  # Default parser value: 5000.
  read_timeout_ms: 5000

  # Time (ms) before a non-progressing session is considered stalled.
  # Default parser value: 300000.
  stall_timeout_ms: 300000

# ─── Worker (SSH) ─────────────────────────────────────────────────────────────
# Distribute agent sessions across remote SSH hosts.
# When ssh_hosts is empty (default), all sessions run locally.
# worker:
#   ssh_hosts:
#     - worker1.example.com            # default port 22
#     - worker2.example.com:2222       # custom port
#     - alice@worker3.example.com      # custom user
#     - "[::1]:2222"                   # IPv6 with port
#   max_concurrent_agents_per_host: 3

# ─── Server ───────────────────────────────────────────────────────────────────
# HTTP dashboard and JSON API. Serves live orchestrator state.
server:
  # Port to bind. Also settable via --port CLI flag (CLI takes precedence).
  # CLI default is currently 8080.
  port: 8080

  # Bind address. Use "0.0.0.0" to expose on all interfaces.
  host: "127.0.0.1"

# ─── Notifications ─────────────────────────────────────────────────────────────
# Optional webhook notifications for issue state transitions and runtime events.
# Messages include a clickable link to the Linear issue.
# notifications:
#   slack:
#     # Webhook URL or $ENV_VAR reference.
#     webhook_url: $SLACK_WEBHOOK_URL
#
#     # Event filters (case-insensitive, normalized to lowercase):
#     #
#     # State transitions:
#     #   todo, in_progress, agent_review, human_review,
#     #   merging, rework, done, closed, cancelled
#     #
#     # Runtime events:
#     #   stalled  — worker exceeded stall timeout
#     #   failed   — non-stall worker failure during execution
#     #
#     # Wildcard:
#     #   all      — subscribe to every event
#     #
#     # Empty list means no notifications are sent.
#     events:
#       - all

# ─── Prompts (per-state prompt injection) ─────────────────────────────────────
# Optional. When configured, the orchestrator selects a prompt template based on
# the issue's Linear state at dispatch time instead of using the markdown body
# below the --- delimiter. Each file is a Liquid template with access to
# {{ issue.* }}, {{ attempt }}, and {{ workspace.base_branch }}.
#
# File paths are resolved relative to this WORKFLOW.md file's directory.
#
# When this section is absent, the entire markdown body after --- is used as
# the prompt for all states (backward compatible with existing workflows).
#
# The shared file is prepended to every state-specific prompt, separated by ---.
# State keys are matched case-insensitively.
#
# Template variables available in per-state prompts:
#   {{ issue.identifier }}        — e.g. "KAT-928"
#   {{ issue.title }}             — issue title
#   {{ issue.state }}             — current Linear state name
#   {{ issue.labels }}            — comma-separated label names
#   {{ issue.description }}       — issue body (may be empty)
#   {{ issue.url }}               — Linear issue URL
#   {{ issue.children_count }}    — number of child sub-issues (0 for flat tickets)
#   {{ issue.parent_identifier }} — parent issue identifier (nil for non-sub-issues)
#   {{ attempt }}                 — retry attempt number (nil on first dispatch)
#   {{ workspace.base_branch }}   — configured base branch (default: "main")
#
# prompts:
#   shared: prompts/shared.md
#   by_state:
#     Todo: prompts/in-progress.md
#     In Progress: prompts/in-progress.md
#     Agent Review: prompts/agent-review.md
#     Merging: prompts/merging.md
#     Rework: prompts/rework.md
#   default: prompts/in-progress.md
---
---

<!-- ═══════════════════════════════════════════════════════════════════════
  PROMPT TEMPLATE BODY
  ═══════════════════════════════════════════════════════════════════════

  With per-state prompt injection (the `prompts:` config section above),
  the prompt body after this --- delimiter is NOT used. The orchestrator
  reads prompt files from the `prompts/` directory instead.

  If you are NOT using per-state prompts, put your monolith prompt
  template here — everything below --- becomes the Liquid template
  rendered for every agent session regardless of issue state.

  See the `prompts/` directory for the per-state prompt files:
    prompts/shared.md          — repo context, tools, workpad protocol
    prompts/shared-symphony.md — Symphony project variant
    prompts/shared-cli.md      — Kata CLI project variant
    prompts/in-progress.md     — implement, test, push, open PR
    prompts/agent-review.md    — address PR feedback
    prompts/merging.md         — land the PR
    prompts/rework.md          — close PR, fresh start
  ═══════════════════════════════════════════════════════════════════════ -->
