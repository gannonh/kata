---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: 89d4761fddf0
  active_states:
    - "In Progress"
    - "Todo"
  terminal_states:
    - "Done"
    - "Cancelled"
    - "Canceled"
    - "Duplicate"

polling:
  interval_ms: 30000

workspace:
  root: ~/symphony-workspaces

agent:
  max_concurrent_agents: 1
  max_turns: 25
  max_retry_backoff_ms: 120000

codex:
  command: ["codex", "app-server"]
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000

hooks:
  after_create: "git clone /Volumes/EVO/kata/kata-mono . --single-branch && git checkout -b symphony/$(basename $PWD)"
  timeout_ms: 120000

server:
  port: 8080
  host: "127.0.0.1"
---

You are working on a Linear issue for the Symphony project (a Rust orchestrator in the kata-mono monorepo).

**Issue:** {{ issue.identifier }} — {{ issue.title }}

**Description:**
{{ issue.description }}

{% if issue.labels != empty %}
**Labels:** {{ issue.labels | join: ", " }}
{% endif %}

{% if issue.blockers != empty %}
**Blocked by:**
{% for blocker in issue.blockers %}
- {{ blocker.identifier }}: {{ blocker.title }}
{% endfor %}
{% endif %}

{% if attempt.number > 1 %}
**Retry attempt {{ attempt.number }}.**
{% if attempt.prior_error != nil %}
Previous attempt failed with: {{ attempt.prior_error }}
Take a different approach.
{% endif %}
{% endif %}

---

## Your environment

You are in a git clone of the kata-mono monorepo. The Symphony crate is at `apps/symphony/`.

You are on branch `symphony/{{ issue.identifier }}`.

## Instructions

1. Read the issue description carefully.
2. Work in `apps/symphony/` unless the issue requires changes elsewhere.
3. Make your changes. Write tests where appropriate.
4. Run `cargo test` from `apps/symphony/` to verify.
5. Run `cargo clippy -- -D warnings` to check for lint issues.
6. Commit your changes with a descriptive message: `feat(symphony): <what you did> ({{ issue.identifier }})`.
7. Push your branch: `git push -u origin symphony/{{ issue.identifier }}`.

When done, summarize what you changed and why.
