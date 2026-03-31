---
tracker:
  kind: github
  api_key: $GH_TOKEN
  repo_owner: my-org
  repo_name: my-repo
  label_prefix: symphony
  # assignee: alice
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Closed
  exclude_labels:
    - kata:task

workspace:
  root: ~/symphony-workspaces
  repo: https://github.com/my-org/my-repo.git
  git_strategy: auto
  isolation: local
  cleanup_on_done: true
  branch_prefix: symphony
  base_branch: main

polling:
  interval_ms: 30000

agent:
  backend: kata-cli
  max_concurrent_agents: 4
  max_turns: 20

kata_agent:
  command: kata
  model: anthropic/claude-sonnet-4-6
  stall_timeout_ms: 300000

server:
  port: 8080
  host: 127.0.0.1
---
