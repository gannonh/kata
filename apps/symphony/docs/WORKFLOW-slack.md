---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project
  active_states:
    - Todo
    - In Progress
    - Agent Review
    - Merging
    - Rework

workspace:
  root: ~/symphony-workspaces
  repo: /path/to/your/repo
  git_strategy: worktree
  isolation: local
  cleanup_on_done: true
  branch_prefix: symphony
  base_branch: main

agent:
  backend: kata-cli
  max_concurrent_agents: 4
  max_turns: 20

kata_agent:
  command: kata
  model: anthropic/claude-sonnet-4-6
  stall_timeout_ms: 300000

server:
  host: 127.0.0.1
  port: 8080
  # Optional public URL used in Slack "Dashboard:" links.
  # When omitted, notifications are sent without a dashboard link.
  public_url: https://symphony.example.com

notifications:
  slack:
    webhook_url: $SLACK_WEBHOOK_URL
    events:
      - human_review
      - stalled
      - failed
      - rework

prompts:
  shared: prompts/shared-symphony.md
  by_state:
    Todo: prompts/in-progress.md
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
  default: prompts/in-progress.md
---
