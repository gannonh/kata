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
  # Docker is orthogonal to git_strategy — any git strategy works inside a container.
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
    # Default: symphony-worker:latest
    image: symphony-worker:latest

    # Optional setup script path on the host. Symphony hashes the script
    # content and caches a derived image layer.
    # setup: docker/setups/rust.sh

    # Codex auth mode inside the worker container:
    #   - auto  (default): OPENAI_API_KEY if set, else mount ~/.codex/auth.json
    #   - mount: force mount ~/.codex/auth.json
    #   - env:   force OPENAI_API_KEY
    # codex_auth: auto

    # Extra env vars passed at `docker run` time.
    # env:
    #   - CARGO_HOME=/usr/local/cargo

    # Extra bind mounts passed at `docker run` time.
    # volumes:
    #   - ~/.ssh:/root/.ssh:ro

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
  # considered stalled. Each turn is one request/response cycle.
  max_turns: 20

  # Maximum exponential back-off delay (ms) between retries on failure.
  # max_retry_backoff_ms: 300000

  # Per-state concurrency caps. Keys are lowercased state names.
  # Limits how many agents can work on issues in a specific state simultaneously.
  # Example: allow 3 "in progress" but only 1 "merging" at a time.
  # max_concurrent_agents_by_state:
  #   in progress: 3
  #   merging: 1

# ─── Codex ────────────────────────────────────────────────────────────────────
# Configures the Codex app-server process that runs inside each agent session.
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

This is the **kata-mono** monorepo. The Symphony crate lives at `apps/symphony/`.

- Build: `cd apps/symphony && cargo build`
- Test: `cd apps/symphony && cargo test`
- Lint: `cd apps/symphony && cargo clippy -- -D warnings`
- Format: `cd apps/symphony && cargo fmt`
- Base branch: `{{ workspace.base_branch }}`. All merges, rebases, and PR base targets use this branch.

Read `apps/symphony/AGENTS.md` for full architecture reference.

## Prerequisite: Linear MCP or `linear_graphql` tool is available

The agent should be able to talk to Linear, either via a configured Linear MCP server or injected `linear_graphql` tool. If none are present, stop and ask the user to configure Linear.

## Linear GraphQL schema quick reference (always in context)

Use this as an always-on guardrail to avoid invalid Linear queries.

- `Issue.links` is invalid. Use `attachments`, `relations`, or
  `inverseRelations`.
- `IssueFilter.identifier` is invalid. For identifier-style filtering, use
  `team.key` + `number`.

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

Add comment:

```graphql
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment {
      id
      url
    }
  }
}
```

Attach URL:

```graphql
mutation AttachURL($issueId: String!, $url: String!, $title: String) {
  attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
    success
    attachment {
      id
      title
      url
    }
  }
}
```

## Default posture

- Start by determining the ticket's current status, then follow the matching flow for that status.
- Start every task by opening the tracking workpad comment and bringing it up to date before doing new implementation work.
- Spend extra effort up front on planning and verification design before implementation.
- Reproduce first: always confirm the current behavior/issue signal before changing code so the fix target is explicit.
- Keep ticket metadata current (state, checklist, acceptance criteria, links).
- Treat a single persistent Linear comment as the source of truth for progress.
- Use that single workpad comment for all progress and handoff notes; do not post separate "done"/summary comments.
- Treat any ticket-authored `Validation`, `Test Plan`, or `Testing` section as non-negotiable acceptance input: mirror it in the workpad and execute it before considering the work complete.
- When meaningful out-of-scope improvements are discovered during execution,
  file a separate Linear issue instead of expanding scope. The follow-up issue
  must include a clear title, description, and acceptance criteria, be placed in
  `Backlog`, be assigned to the same project as the current issue, link the
  current issue as `related`, and use `blockedBy` when the follow-up depends on
  the current issue.
- Move status only when the matching quality bar is met.
- Operate autonomously end-to-end unless blocked by missing requirements, secrets, or permissions.
- Use the blocked-access escape hatch only for true external blockers (missing required tools/auth) after exhausting documented fallbacks.

## Related skills

- `linear`: interact with Linear. **MANDATORY: read `.codex/skills/linear/SKILL.md` before ANY `linear_graphql` tool call.** It contains the exact correct query shapes, field names, and argument types. Do not guess Linear GraphQL schema — use the skill.
- `commit`: produce clean, logical commits during implementation.
- `push`: keep remote branch current and publish updates.
- `pull`: keep branch updated before handoff. Use `origin/{{ workspace.base_branch }}` as the upstream.
- `land`: when ticket reaches `Merging`, explicitly open and follow `.codex/skills/land/SKILL.md`, which includes the `land` loop.

## Status map

- `Backlog` -> out of scope for this workflow; do not modify.
- `Todo` -> queued; the orchestrator moves this to `In Progress` on dispatch. Verify state is `In Progress` before active work.
  - Special case: if a PR is already attached, treat as feedback/rework loop (run full PR feedback sweep, address or explicitly push back, revalidate, return to `Human Review`).
- `In Progress` -> implementation actively underway.
- `Agent Review` -> PR feedback needs to be addressed. Run the full PR feedback sweep protocol, make targeted fixes, push to existing branch, then move to `Human Review`.
- `Human Review` -> PR is attached and validated; waiting on human approval. Do not code or change ticket content.
- `Merging` -> approved by human; execute the `land` skill flow (do not call `gh pr merge` directly).
- `Rework` -> reviewer requested changes; planning + implementation required.
- `Done` -> terminal state; no further action required.

## Step 0: Determine current ticket state and route

0. Before ANY other action, read `.codex/skills/linear/SKILL.md` and keep it in context. Do not guess Linear GraphQL schema.
1. Fetch the issue by explicit ticket ID.
2. Read the current state.
3. Route to the matching flow:
   - `Backlog` -> do not modify issue content/state; stop and wait for human to move it to `Todo`.
   - `Todo` -> orchestrator already moved to `In Progress`; verify state, then ensure bootstrap workpad comment exists (create if missing), then start execution flow.
     - If PR is already attached, start by reviewing all open PR comments and deciding required changes vs explicit pushback responses.
   - `In Progress` -> continue execution flow from current scratchpad comment.
   - `Agent Review` -> run full PR feedback sweep protocol: read all PR comments (human and bot), address each actionable comment with code fix or justified pushback, push to existing branch, then move to `Human Review`.
   - `Human Review` -> wait and poll for decision/review updates.
   - `Merging` -> on entry, open and follow `.codex/skills/land/SKILL.md`; do not call `gh pr merge` directly.
   - `Rework` -> run rework flow.
   - `Done` -> do nothing and shut down.
4. Check whether a PR already exists for the current branch and whether it is closed.
   - If a branch PR exists and is `CLOSED` or `MERGED`, treat prior branch work as non-reusable for this run.
   - Create a fresh branch from `origin/{{ workspace.base_branch }}` and restart execution flow as a new attempt.
5. For `Todo` tickets, do startup sequencing in this exact order:
   - verify issue is in `In Progress` (orchestrator handles this on dispatch)
   - find/create `## Codex Workpad` bootstrap comment
   - only then begin analysis/planning/implementation work.
6. Add a short comment if state and issue content are inconsistent, then proceed with the safest flow.

## Step 1: Start/continue execution (Todo or In Progress)

1. Find or create a single persistent scratchpad comment for the issue:
    - Search existing comments for a marker header: `## Codex Workpad`.
    - Ignore resolved comments while searching; only active/unresolved comments are eligible to be reused as the live workpad.
    - If found, reuse that comment; do not create a new workpad comment.
    - If not found, create one workpad comment and use it for all updates.
    - Persist the workpad comment ID and only write progress updates to that ID.
2. If arriving from `Todo`, do not delay on additional status transitions: the issue should already be `In Progress` before this step begins.
3. Immediately reconcile the workpad before new edits:
    - Check off items that are already done.
    - Expand/fix the plan so it is comprehensive for current scope.
    - Ensure `Acceptance Criteria` and `Validation` are current and still make sense for the task.
4. Start work by writing/updating a hierarchical plan in the workpad comment.
5. Ensure the workpad includes a compact environment stamp at the top as a code fence line:
    - Format: `<host>:<abs-workdir>@<short-sha>`
    - Example: `devbox-01:/home/dev-user/code/symphony-workspaces/MT-32@7bdde33bc`
    - Do not include metadata already inferable from Linear issue fields (`issue ID`, `status`, `branch`, `PR link`).
6. Add explicit acceptance criteria and TODOs in checklist form in the same comment.
    - If changes are user-facing, include a UI walkthrough acceptance criterion that describes the end-to-end user path to validate.
    - If changes touch app files or app behavior, add explicit app-specific flow checks to `Acceptance Criteria` in the workpad (for example: launch path, changed interaction path, and expected result path).
    - If the ticket description/comment context includes `Validation`, `Test Plan`, or `Testing` sections, copy those requirements into the workpad `Acceptance Criteria` and `Validation` sections as required checkboxes (no optional downgrade).
7. Run a principal-style self-review of the plan and refine it in the comment.
8. Before implementing, capture a concrete reproduction signal and record it in the workpad `Notes` section (command/output, screenshot, or deterministic UI behavior).
9. Run the `pull` skill to sync with latest `origin/{{ workspace.base_branch }}` before any code edits, then record the pull/sync result in the workpad `Notes`.
    - Include a `pull skill evidence` note with:
      - merge source(s),
      - result (`clean` or `conflicts resolved`),
      - resulting `HEAD` short SHA.
10. Compact context and proceed to execution.

## PR feedback sweep protocol (required)

When a ticket has an attached PR, run this protocol before moving to `Human Review`:

1. Identify the PR number from issue links/attachments.
2. Gather feedback from all channels:
   - Top-level PR comments (`gh pr view --comments`).
   - Inline review comments (`gh api repos/<owner>/<repo>/pulls/<pr>/comments`).
   - Review summaries/states (`gh pr view --json reviews`).
3. Treat every actionable reviewer comment (human or bot), including inline review comments, as blocking until one of these is true:
   - code/test/docs updated to address it, or
   - explicit, justified pushback reply is posted on that thread.
4. Update the workpad plan/checklist to include each feedback item and its resolution status.
5. Re-run validation after feedback-driven changes and push updates.
6. Repeat this sweep until there are no outstanding actionable comments.

## Blocked-access escape hatch (required behavior)

Use this only when completion is blocked by missing required tools or missing auth/permissions that cannot be resolved in-session.

- GitHub is **not** a valid blocker by default. Always try fallback strategies first (alternate remote/auth mode, then continue publish/review flow).
- Do not move to `Human Review` for GitHub access/auth until all fallback strategies have been attempted and documented in the workpad.
- If a non-GitHub required tool is missing, or required non-GitHub auth is unavailable, move the ticket to `Human Review` with a short blocker brief in the workpad that includes:
  - what is missing,
  - why it blocks required acceptance/validation,
  - exact human action needed to unblock.
- Keep the brief concise and action-oriented; do not add extra top-level comments outside the workpad.

## Step 2: Execution phase (Todo -> In Progress -> Human Review)

1. Determine current repo state (`branch`, `git status`, `HEAD`) and verify the kickoff `pull` sync result is already recorded in the workpad before implementation continues.
2. Verify current issue state is `In Progress` (orchestrator moves from `Todo` on dispatch).
3. Load the existing workpad comment and treat it as the active execution checklist.
    - Edit it liberally whenever reality changes (scope, risks, validation approach, discovered tasks).
4. Implement against the hierarchical TODOs and keep the comment current:
    - Check off completed items.
    - Add newly discovered items in the appropriate section.
    - Keep parent/child structure intact as scope evolves.
    - Update the workpad immediately after each meaningful milestone (for example: reproduction complete, code change landed, validation run, review feedback addressed).
    - Never leave completed work unchecked in the plan.
    - For tickets that started as `Todo` with an attached PR, run the full PR feedback sweep protocol immediately after kickoff and before new feature work.
5. Run validation/tests required for the scope.
    - Mandatory gate: execute all ticket-provided `Validation`/`Test Plan`/ `Testing` requirements when present; treat unmet items as incomplete work.
    - Prefer a targeted proof that directly demonstrates the behavior you changed.
    - You may make temporary local proof edits to validate assumptions (for example: tweak a local build input for `make`, or hardcode a UI account / response path) when this increases confidence.
    - Revert every temporary proof edit before commit/push.
    - Document these temporary proof steps and outcomes in the workpad `Validation`/`Notes` sections so reviewers can follow the evidence.
    - If app-touching, run `launch-app` validation and capture/upload media via `github-pr-media` before handoff.
6. Re-check all acceptance criteria and close any gaps.
7. Before every `git push` attempt, run the required validation for your scope and confirm it passes; if it fails, address issues and rerun until green, then commit and push changes.
8. Attach PR URL to the issue (prefer attachment; use the workpad comment only if attachment is unavailable).
    - Ensure the GitHub PR has label `symphony` (add it if missing).
9. Merge latest `origin/{{ workspace.base_branch }}` into branch, resolve conflicts, and rerun checks.
10. Update the workpad comment with final checklist status and validation notes.
    - Mark completed plan/acceptance/validation checklist items as checked.
    - Add final handoff notes (commit + validation summary) in the same workpad comment.
    - Do not include PR URL in the workpad comment; keep PR linkage on the issue via attachment/link fields.
    - Add a short `### Confusions` section at the bottom when any part of task execution was unclear/confusing, with concise bullets.
    - Do not post any additional completion summary comment.
11. Before moving to `Human Review`, run publish proofs, then poll PR feedback/checks:
    - Run and record these publish proofs in the workpad `Notes` section:
      - `git ls-remote --exit-code --heads origin "$(git branch --show-current)"`
      - `gh pr view --json url,state,headRefName,baseRefName`
    - Confirm `gh pr view` reports `state: OPEN` and `headRefName` equals the current branch.
    - If either publish proof fails, do not move state; fix publish/PR linkage first.
    - Read the PR `Manual QA Plan` comment (when present) and use it to sharpen UI/runtime test coverage for the current change.
    - Run the full PR feedback sweep protocol.
    - Confirm PR checks are passing (green) after the latest changes.
    - Confirm every required ticket-provided validation/test-plan item is explicitly marked complete in the workpad.
    - Repeat this check-address-verify loop until no outstanding comments remain and checks are fully passing.
    - Re-open and refresh the workpad before state transition so `Plan`, `Acceptance Criteria`, and `Validation` exactly match completed work.
12. Only then move issue to `Human Review`.
    - Exception: if blocked by missing required non-GitHub tools/auth per the blocked-access escape hatch, move to `Human Review` with the blocker brief and explicit unblock actions.
13. For `Todo` tickets that already had a PR attached at kickoff:
    - Ensure all existing PR feedback was reviewed and resolved, including inline review comments (code changes or explicit, justified pushback response).
    - Ensure branch was pushed with any required updates.
    - Then move to `Human Review`.

## Step 3: Human Review and merge handling

1. When the issue is in `Human Review`, do not code or change ticket content.
2. Poll for updates as needed, including GitHub PR review comments from humans and bots.
3. If review feedback requires changes, move the issue to `Rework` and follow the rework flow.
4. If approved, human moves the issue to `Merging`.
5. When the issue is in `Merging`, open and follow `.codex/skills/land/SKILL.md`, then run the `land` skill in a loop until the PR is merged. Do not call `gh pr merge` directly.
6. After merge is complete, move the issue to `Done`.

## Step 4: Rework handling

1. Treat `Rework` as a full approach reset, not incremental patching.
2. Re-read the full issue body and all human comments; explicitly identify what will be done differently this attempt.
3. Close the existing PR tied to the issue.
4. Remove the existing `## Codex Workpad` comment from the issue.
5. Create a fresh branch from `origin/{{ workspace.base_branch }}`.
6. Start over from the normal kickoff flow:
   - If current issue state is `Todo`, move it to `In Progress`; otherwise keep the current state.
   - Create a new bootstrap `## Codex Workpad` comment.
   - Build a fresh plan/checklist and execute end-to-end.

## Completion bar before Human Review

- Step 1/2 checklist is fully complete and accurately reflected in the single workpad comment.
- Acceptance criteria and required ticket-provided validation items are complete.
- Validation/tests are green for the latest commit.
- PR feedback sweep is complete and no actionable comments remain.
- Publish proof is recorded in the workpad: `git ls-remote --exit-code --heads origin "$(git branch --show-current)"` succeeds and `gh pr view --json url,state,headRefName,baseRefName` confirms an `OPEN` PR for the current branch.
- PR checks are green and the PR is linked on the issue.
- Required PR metadata is present (`symphony` label).
- If app-touching, runtime validation/media requirements from `App runtime validation (required)` are complete.

## Guardrails

- If the branch PR is already closed/merged, do not reuse that branch or prior implementation state for continuation.
- For closed/merged branch PRs, create a new branch from `origin/{{ workspace.base_branch }}` and restart from reproduction/planning as if starting fresh.
- If issue state is `Backlog`, do not modify it; wait for human to move to `Todo`.
- Do not edit the issue body/description for planning or progress tracking.
- Use exactly one persistent workpad comment (`## Codex Workpad`) per issue.
- If comment editing is unavailable in-session, use the update script. Only report blocked if both MCP editing and script-based editing are unavailable.
- Temporary proof edits are allowed only for local verification and must be reverted before commit.
- If out-of-scope improvements are found, create a separate Backlog issue rather
  than expanding current scope, and include a clear
  title/description/acceptance criteria, same-project assignment, a `related`
  link to the current issue, and `blockedBy` when the follow-up depends on the
  current issue.
- Do not move to `Human Review` unless the `Completion bar before Human Review` is satisfied.
- In `Human Review`, do not make changes; wait and poll.
- If state is terminal (`Done`), do nothing and shut down.
- Keep issue text concise, specific, and reviewer-oriented.
- If blocked and no workpad exists yet, add one blocker comment describing blocker, impact, and next unblock action.

## Workpad template

Use this exact structure for the persistent workpad comment and keep it updated in place throughout execution:

````md
## Codex Workpad

```text
<hostname>:<abs-path>@<short-sha>
```

### Plan

- [ ] 1\. Parent task
  - [ ] 1.1 Child task
  - [ ] 1.2 Child task
- [ ] 2\. Parent task

### Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

### Validation

- [ ] targeted tests: `<command>`

### Notes

- <short progress note with timestamp>

### Confusions

- <only include when something was confusing during execution>
````
