---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project
  # assignee: alice
  active_states:
    - Todo
    - In Progress
    - Agent Review
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 30000
workspace:
  root: ~/symphony-workspaces
  repo: /path/to/your/repo
  git_strategy: worktree
  isolation: local
  cleanup_on_done: true
  branch_prefix: symphony
  clone_branch: main
  base_branch: main
hooks:
  timeout_ms: 120000
agent:
  backend: kata-cli
  max_concurrent_agents: 4
  max_turns: 20
kata_agent:
  command: kata
  model: anthropic/claude-opus-4-6
  model_by_state:
    Agent Review: anthropic/claude-sonnet-4-6
    Merging: anthropic/claude-sonnet-4-6
  stall_timeout_ms: 900000
prompts:
  system: prompts/system.md
  repo: prompts/repo-sym.md
  by_state:
    Todo: prompts/in-progress.md
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
  default: prompts/in-progress.md
server:
  port: 8080
  host: "127.0.0.1"
---
