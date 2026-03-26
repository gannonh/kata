---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: my-project           # Your Linear project slug
  # assignee: alice                   # Optional: filter to a specific user
  active_states:
    - Todo
    - In Progress
    - Agent Review
    - Merging
    - Rework
  terminal_states:
    - Done
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
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
  backend: kata-cli              # "codex" or "kata-cli" (aliases: kata, pi)
  max_concurrent_agents: 4
  max_turns: 20
kata_agent:
  command: kata
  model: anthropic/claude-opus-4-6
  model_by_state:
    Agent Review: anthropic/claude-opus-4-6
    Merging: anthropic/claude-opus-4-6
  stall_timeout_ms: 900000
codex:
  command: codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh --model gpt-5.3-codex app-server
  stall_timeout_ms: 900000
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
server:
  port: 8080
  host: "127.0.0.1"
---

You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation or validation unless needed for new code changes.
- Do not end the turn while the issue remains in an active state unless you are blocked by missing required permissions/secrets.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Instructions:

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions/secrets). If blocked, record it in the workpad and move the issue according to workflow.
3. Final message must report completed actions and blockers only. Do not include "next steps for user".

Work only in the provided repository copy. Do not touch any other path.

## Repository context

This is the **kata-mono** monorepo. The Kata CLI app lives at `apps/cli/`.

- Build: `cd apps/cli && npx tsc`
- Test: `cd apps/cli && node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Validate all: `bun run validate`
- Base branch: `{{ workspace.base_branch }}`. All merges, rebases, and PR base targets use this branch.

Read `apps/cli/AGENTS.md` and `apps/cli/README.md` for full architecture reference, directory structure, and development conventions.
Read the root `AGENTS.md` for monorepo-level build, test, and CI commands.

## Prerequisite: Linear MCP or `linear_graphql` tool is available

The agent should be able to talk to Linear, either via a configured Linear MCP server or injected `linear_graphql` tool. If none are present, stop and ask the user to configure Linear.

## Linear GraphQL schema quick reference (always in context)

Use this as an always-on guardrail to avoid invalid Linear queries.

- `Issue.links` is invalid. Use `attachments`, `relations`, or `inverseRelations`.
- `IssueFilter.identifier` is invalid. For identifier-style filtering, use `team.key` + `number`.

Query by issue identifier (preferred):

```graphql
query IssueByIdentifier($identifier: String!) {
  issue(id: $identifier) {
    id
    identifier
    title
    state {
      id
      name
      type
    }
  }
}
```

Query by identifier using `issues(filter: ...)`:

```graphql
query IssueByTeamKeyAndNumber($teamKey: String!, $number: Float!) {
  issues(
    filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }
    first: 1
  ) {
    nodes {
      id
      identifier
      title
    }
  }
}
```

Move issue state by name (resolve `stateId` first):

```graphql
query IssueTeamStates($id: String!) {
  issue(id: $id) {
    team {
      states {
        nodes {
          id
          name
          type
        }
      }
    }
  }
}
```

```graphql
mutation MoveIssueToState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue {
      id
      state {
        id
        name
      }
    }
  }
}
```

## Slice Dispatch Unit

This workflow is for Kata CLI planned execution and dispatches a **slice issue** (parent issue).

- Treat an issue as a slice when either condition is true:
  - issue has label `kata:slice`
  - issue has one or more child issues
- Child task issues are typically labeled `kata:task`.
- If no child issues exist, continue with normal flat execution flow from this file.

## Context Loading Protocol (required order)

Before implementation starts, load context in this exact order:

1. Child issues (`issue.children`) to discover task list and ordering.
2. Slice issue + child task issue descriptions to read plans (`S0N-PLAN` in slice description, `T0N-PLAN` in task description). Use slice/task documents only as backward-compatible fallback when descriptions are empty.
3. Slice issue documents (`issue.documents`) for remaining slice-scoped docs (`S0N-RESEARCH`, `S0N-UAT`, optional legacy summaries/plans).
4. Project documents (`project.documents`) to read project-scoped docs (`PROJECT`, `REQUIREMENTS`, `DECISIONS`, `M00N-CONTEXT`, `M00N-ROADMAP`).
5. Milestone context via `issue.projectMilestone` to get the milestone name, then find `M00N-CONTEXT` and `M00N-ROADMAP` in the project documents (milestone docs are attached to the project, not the milestone entity).

Preferred query patterns:

```graphql
query SliceChildren($id: String!) {
  issue(id: $id) {
    children {
      nodes {
        id
        identifier
        title
        state {
          name
          type
        }
      }
    }
  }
}
```

```graphql
query IssueDocuments($id: String!) {
  issue(id: $id) {
    documents {
      nodes {
        id
        title
        content
      }
    }
  }
}
```

```graphql
query ProjectDocuments($id: String!) {
  project(id: $id) {
    documents {
      nodes {
        id
        title
        content
      }
    }
  }
}
```

```graphql
query IssueMilestone($id: String!) {
  issue(id: $id) {
    projectMilestone {
      id
      name
    }
  }
}
```

Note: `projectMilestone.documents` does not exist in the Linear API. Milestone-related docs (M00N-CONTEXT, M00N-ROADMAP) are stored as project documents. Use the `ProjectDocuments` query above and filter by title prefix matching the milestone ID.

## Slice Execution Flow

1. Dispatch starts on the slice issue.
2. Detect slice mode (`kata:slice` label or child issues).
3. Load hierarchy context per protocol above.
4. Build an ordered task list from child issues (`T01 -> T02 -> T03` by task prefix when present; otherwise by issue number asc).
5. Execute tasks in order, following each corresponding task plan document.
6. After each completed child task:
   - run required validation for that task,
   - commit with task reference in the message,
   - move the child issue to `Done` using `issueUpdate` + resolved `stateId`.
7. Keep one PR for the entire slice branch.
8. After all child tasks are done, run review loop and CI checks.
9. On merge, ensure all children are `Done`, then move the slice issue to `Done`.

## Workpad Format for Slices

Use one persistent workpad comment and include task-level progress:

````md
## Codex Workpad

```text
<host>:<abs-workdir>@<short-sha>
```

### Task Progress

- [ ] T01: <title> (<identifier>) — Pending
- [ ] T02: <title> (<identifier>) — Pending
- [ ] T03: <title> (<identifier>) — Pending

### Plan

- [ ] 1\. Load context hierarchy
- [ ] 2\. Execute T01 per T01-PLAN
- [ ] 3\. Execute T02 per T02-PLAN
- [ ] 4\. Execute T03 per T03-PLAN
- [ ] 5\. Create/update PR for slice

### Acceptance Criteria

- [ ] All child tasks moved to `Done` after implementation and validation
- [ ] Slice issue moved to `Done` after merge
- [ ] Single PR covers entire slice implementation

### Validation

- [ ] required tests/lint/build commands for touched scope

### Notes

- <timestamped progress and evidence>

### Confusions

- <only include if something was unclear>
````

## Status map

- `Backlog` -> out of scope for this workflow; do not modify.
- `Todo` -> orchestrator moves to `In Progress` on dispatch; verify then execute.
- `In Progress` -> active implementation and slice task execution. After PR
  publish-proof and required validation gates pass, move to `Agent Review`.
- `Agent Review` -> address review/bot feedback on the existing PR.
- `Human Review` -> no coding; wait for approval/rejection.
- `Merging` -> run `.codex/skills/land/SKILL.md` merge loop, then move slice
  to `Done`.
- `Rework` -> close prior PR, create fresh branch from `origin/{{ workspace.base_branch }}`, restart.
- `Done` -> terminal state; do nothing.

## Step 0: Determine current ticket state and route

0. Before ANY other action, read `.codex/skills/linear/SKILL.md` and keep it in context.
1. Fetch the issue by explicit ticket ID.
2. Route by state.
3. Ensure workpad reuse is deterministic:
   - list comments before creating anything,
   - match `## Codex Workpad` heading candidates (case-sensitive, at the start of a markdown heading line),
   - reuse the most recently updated active/unresolved candidate when one exists,
   - create exactly one new workpad when no active candidate exists (even if resolved/archived workpads exist),
   - persist that chosen comment ID for all further updates.
4. Check if a PR already exists for the current branch and whether it is closed/merged.
   - If closed/merged, create a fresh branch from `origin/{{ workspace.base_branch }}` and restart.

## Step 1: Plan and reproduce (In Progress)

1. Update/reconcile the workpad before any new implementation edits.
2. Stamp environment line `<host>:<abs-workdir>@<short-sha>`.
3. Capture a concrete reproduction/context signal in `Notes`.
4. Run pull-sync against `origin/{{ workspace.base_branch }}` and record merge source/result/HEAD in workpad notes.
5. For slice issues, load hierarchy context and build task-order checklist.
6. Do a principal-style plan review and refine plan/checklists before coding.

## Step 2: Execute

1. Implement child tasks in order from the task checklist.
2. Keep workpad current after each milestone and check completed items immediately.
3. Run validation continuously; do not defer to the end.
4. After each child task completion, move that child issue to `Done`.
5. Maintain one PR for the slice.
6. Before state transition, ensure workpad Plan/Acceptance/Validation exactly match reality.
7. After publish-proof and required-check gates pass, move issue state from
   `In Progress` to `Agent Review`.

## Step 3: Review and merge

1. In `Agent Review`, address all actionable PR comments (top-level + inline + review summaries), push fixes, rerun validation.
2. Move to `Human Review` only when no unresolved actionable comments remain and checks are green.
3. In `Merging`, run `.codex/skills/land/SKILL.md` (do not call `gh pr merge`
   directly), then move slice issue to `Done`.
4. Ensure children are already `Done`; if not, resolve before marking slice done.

## Guardrails

- Keep `apps/symphony/WORKFLOW-symphony.md` unchanged for flat Symphony ticket flow.
- Do not edit issue body for planning/progress tracking; use only one persistent workpad comment.
- Do not use `Issue.links` or `IssueFilter.identifier` in GraphQL.
- If blocked by missing required non-GitHub auth/tools, capture blocker in workpad and move per workflow.
- If app behavior is touched, include runtime validation evidence in workpad.
