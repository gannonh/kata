# M003: PR Lifecycle

**Vision:** Built-in pull request lifecycle management — create, review, address comments, merge — integrated into Kata's slice workflow for both file-mode and Linear-mode projects.

## Success Criteria

- Completing a slice can auto-create a PR with body composed from slice artifacts (plan, task summaries, verification results)
- `/kata pr review` dispatches specialized reviewer subagents in parallel and presents aggregated, severity-ranked findings
- `/kata pr address` lets the agent triage and fix PR review comments, resolve threads, and push updates
- `/kata pr merge` validates CI, merges the PR, and completes the slice
- PR behavior is configurable per-project via preferences
- All PR operations work in both file-mode and Linear-mode (Linear linking is additive)

## Key Risks / Unknowns

- Parallel subagent dispatch for review — 6 reviewers need identical diff/context and must handle partial failures gracefully
- PR body quality from auto-composition — slice artifacts need to produce useful PR descriptions, not raw markdown dumps
- `gh` CLI dependency — all GitHub operations require `gh` installed and authenticated; detection and guidance must be robust

## Proof Strategy

- Parallel subagent dispatch → retire in S02 by proving 6 reviewers run in parallel against a real PR diff and produce aggregated findings
- PR body quality → retire in S01 by proving auto-composed body from real slice artifacts is readable and useful in GitHub's PR UI
- `gh` CLI dependency → retire in S01 by proving detection, auth check, and graceful error when `gh` is missing

## Verification Classes

- Contract verification: unit tests for PR body template composition, preference parsing, reviewer finding aggregation
- Integration verification: real `gh` CLI calls creating/reviewing/merging PRs against a GitHub repo
- Operational verification: full slice→PR→review→address→merge cycle in auto-mode
- UAT / human verification: user confirms PR body is useful, review findings are actionable, merge completes cleanly

## Milestone Definition of Done

This milestone is complete only when all are true:

- Slice completion creates a PR with body derived from slice artifacts (plan, summaries, verification)
- 6 bundled reviewer subagents (code-reviewer, failure-finder, test-analyzer, type-design-analyzer, comment-analyzer, code-simplifier) dispatch in parallel and produce structured findings
- Review comment addressing workflow fetches comments, applies fixes, resolves threads, pushes
- PR merge validates CI, merges, cleans up branch, updates slice status
- `/kata pr` command works with create/review/address/merge/status subcommands
- Preferences control PR behavior (enabled, auto-create, base branch, review on create, linear link)
- Everything works in both file-mode and Linear-mode
- Linear cross-linking adds issue references to PR body and updates Linear issue on merge (when both modes active)

## Requirement Coverage

- Covers: R200, R201, R202, R203, R204, R205, R206, R207, R208
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: PR Creation & Body Composition** `risk:medium` `depends:[]`
  > After this: agent can create a PR for the current slice branch with body auto-composed from slice artifacts (plan, task summaries, verification results) via `gh` CLI, with `gh` detection, auth checking, and file-backed body creation.

- [x] **S02: Bundled Reviewer Subagents & Parallel Dispatch** `risk:high` `depends:[S01]`
  > After this: agent can run `/kata pr review` which dispatches 6 specialized reviewer subagents in parallel against the PR diff, aggregates findings by severity, and presents a structured review report.

- [x] **S03: Address Review Comments** `risk:low` `depends:[S01]`
  > After this: agent can run `/kata pr address` which fetches PR review comments via GraphQL, presents them for triage, applies selected fixes, resolves GitHub threads, and pushes updates.

- [x] **S04: Merge & Slice Completion** `risk:low` `depends:[S01]`
  > After this: agent can run `/kata pr merge` which runs local CI checks, merges the PR via `gh`, deletes the branch, and updates slice status to complete.

- [ ] **S05: Preferences, Onboarding & `/kata pr` Command** `risk:medium` `depends:[S01, S02, S03, S04]`
  > After this: user can configure PR behavior via preferences (enabled, auto-create, base branch, review on create), `/kata` wizard detects GitHub remote and offers PR setup, and `/kata pr` provides unified command surface for all PR operations.

- [ ] **S06: Linear Cross-linking** `risk:low` `depends:[S05]`
  > After this: when both Linear mode and PR lifecycle are active, PRs include Linear issue references in the body, and Linear issues are updated with PR links on creation and status on merge.

## Boundary Map

### S01 → S02

Produces:
- `pr-lifecycle` extension scaffold with command registration, preference reading
- `gh` CLI detection and auth checking utilities
- PR body composition from slice artifacts (template + artifact reader)
- `create_pr_safe.py` bundled script for file-backed PR creation
- PR creation tool callable by agent and by slice completion hooks

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- `fetch_comments.py` bundled script for GraphQL comment fetching
- Extension scaffold and `gh` utilities

Consumes:
- nothing (first slice)

### S01 → S04

Produces:
- Extension scaffold, `gh` utilities, PR status checking
- Slice status update interface (file-mode: update plan checkboxes; Linear-mode: update issue status)

Consumes:
- nothing (first slice)

### S02 → S05

Produces:
- 6 bundled reviewer subagent definitions in `src/resources/agents/`
- Review dispatch logic (parallel subagent calls with identical diff/context)
- Finding aggregation and deduplication (severity ranking, structured output)
- `pr.review_on_create` preference consumed

Consumes from S01:
- Extension scaffold, `gh` utilities, PR diff fetching

### S03 → S05

Produces:
- Comment addressing workflow (fetch → present → fix → resolve → push)
- Thread resolution via `gh` API

Consumes from S01:
- `fetch_comments.py`, extension scaffold, `gh` utilities

### S04 → S05

Produces:
- Merge workflow (CI check → merge → branch cleanup → slice status update)
- Slice completion integration

Consumes from S01:
- Extension scaffold, `gh` utilities, slice status interface

### S01–S04 → S05

Produces:
- `/kata pr` command with subcommands routing to S01–S04 workflows
- Preference definitions (`pr.enabled`, `pr.auto_create`, `pr.base_branch`, `pr.review_on_create`, `pr.linear_link`)
- Onboarding: `/kata` wizard GitHub remote detection and PR setup prompts
- Auto-mode hook: slice completion → auto-PR creation when `pr.auto_create` is true

Consumes from S01–S04:
- All PR operation implementations (create, review, address, merge)

### S05 → S06

Produces:
- Linear issue reference injection into PR body (e.g., `Closes KAT-42`)
- Linear issue update on PR creation (add PR link) and merge (update status)
- `pr.linear_link` preference gate

Consumes from S05:
- Preference system, `/kata pr` command surface
Consumes from M002:
- Linear client, Linear mode detection, entity mapping
