---
tracker:
  # Choose `github` or `linear`.
  kind: github

  # GitHub tracker settings. Replace these for your repository/project.
  repo_owner: your-github-owner
  repo_name: your-repo-name
  github_project_owner_type: user
  github_project_number: 1

  # Linear tracker settings, used when `kind: linear`.
  # workspace_slug: your-linear-workspace
  # project_slug: your-linear-project

  active_states:
    - Todo
    - In Progress
    - Agent Review
    - Merging
    - Rework
  terminal_states:
    - Done
  exclude_labels:
    - kata:task
polling:
  interval_ms: 30000
workspace:
  # These relative paths assume you run Symphony from the repository root.
  root: .symphony/workspaces
  repo: .
  git_strategy: worktree
  isolation: local
  cleanup_on_done: false
  branch_prefix: symphony
  clone_branch: main
  base_branch: main
hooks:
  timeout_ms: 1200000
agent:
  name: pi
  command: pi --mode rpc
  no_session: false
  max_concurrent_agents: 4
  max_turns: 20
  # Set the default model for your agent harness.
  # model: provider/model-name
  stall_timeout_ms: 900000
prompts:
  system: prompts/system.md
  repo: prompts/repo.md
  by_state:
    Todo: prompts/in-progress.md
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
  default: prompts/in-progress.md
supervisor:
  enabled: true
  steer_cooldown_ms: 120000
server:
  port: 8080
  host: 127.0.0.1
# notifications:
#   slack:
#     webhook_url: $SLACK_WEBHOOK_URL
#     events:
#       - all
---
