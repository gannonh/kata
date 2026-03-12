# M003: PR Lifecycle — Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

## Project Description

Integrate pull request lifecycle management into Kata CLI as a first-class workflow capability. PR creation, review, comment addressing, and merging become built-in operations that work in both file-mode and Linear-mode projects.

## Why This Milestone

Kata manages the full development loop — plan, execute, verify, summarize — but stops short of the PR boundary. Developers currently use manual `gh` commands or external skills to create and manage PRs. This breaks flow, loses context (slice artifacts aren't automatically surfaced in PR bodies), and leaves review/merge as disconnected steps outside the agent's workflow.

The user has existing proven PR tooling (custom subagents for specialized review, workflow skills for create/review/address/merge) that validates the approach and provides concrete implementation patterns to port.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Complete a slice and have Kata auto-create a PR with body composed from slice artifacts
- Run `/kata pr review` and get parallel specialized review from 6 subagents (code quality, tests, error handling, types, comments, simplification)
- Run `/kata pr address` to triage and fix PR review comments with thread resolution
- Run `/kata pr merge` to validate CI, merge, and complete the slice
- Configure PR behavior per-project via preferences (auto-create, base branch, review on create)

### Entry point / environment

- Entry point: `/kata pr` command, slice completion hooks, preferences
- Environment: local dev with git repo and GitHub remote
- Live dependencies involved: GitHub API via `gh` CLI, git

## Completion Class

- Contract complete means: PR body templates produce correct markdown from slice artifacts; reviewer subagents produce structured findings; preferences are read/written correctly
- Integration complete means: full slice→PR→review→address→merge cycle works against a real GitHub repo
- Operational complete means: auto-mode creates PRs during slice advancement when configured

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- A slice completion in auto-mode creates a PR with correct body content derived from slice artifacts
- `/kata pr review` dispatches reviewer subagents in parallel and presents aggregated findings
- `/kata pr address` fetches real review comments, applies fixes, resolves threads, and pushes
- `/kata pr merge` runs CI checks, merges, and updates slice status
- All of the above work in both file-mode and Linear-mode projects (Linear linking is additive, not required)

## Risks and Unknowns

- Subagent dispatch reliability — parallel reviewer subagents need the same diff/context; if any fail the review should still complete with partial results
- PR body composition quality — auto-generated PR bodies from slice artifacts need to be useful, not just a dump of markdown files
- `gh` CLI availability — all GitHub operations depend on `gh` being installed and authenticated; need graceful detection and guidance
- Shell interpolation in PR bodies — solved by `create_pr_safe.py` pattern (file-backed body), must carry forward

## Existing Codebase / Prior Art

- `src/resources/agents/` — existing bundled subagents (worker, scout, researcher); PR reviewer agents follow the same pattern
- `src/resource-loader.ts` — syncs bundled resources including agents to `~/.kata-cli/agent/agents/`
- `src/resources/extensions/kata/` — core extension with preferences, commands, hooks, auto-mode; PR extension follows same patterns
- User's `pull-requests` skill — 4-mode workflow (create/review/address/merge) with reference files for reviewer dispatch; primary blueprint
- User's `pr-review-plugin` — 6 specialized reviewer subagent definitions with confidence scoring; port agent prompts directly
- User's `gh-address-comments` skill — focused comment addressing workflow with `fetch_comments.py`; port workflow and script
- User's `create_pr_safe.py` — file-backed PR creation to prevent shell interpolation; carry forward as-is
- User's `fetch_comments.py` — GraphQL comment fetcher; carry forward as-is

> See `.kata/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R200 — PR creation as part of slice completion
- R201 — Specialized parallel PR review via subagents
- R202 — PR review comment addressing workflow
- R203 — PR merge with CI validation
- R204 — PR lifecycle preferences
- R205 — `/kata pr` command surface
- R206 — PR body composition from slice artifacts
- R207 — Bundled PR reviewer subagents
- R208 — Linear cross-linking for PRs

## Scope

### In Scope

- PR creation (auto and manual) with body composed from Kata slice artifacts
- Specialized code review via 6 bundled reviewer subagents dispatched in parallel
- Review comment addressing (fetch, triage, fix, resolve, push)
- PR merge with CI validation and slice completion
- `/kata pr` command with create/review/address/merge/status subcommands
- Per-project preferences for PR behavior
- Onboarding detection of git + GitHub remote
- Scripts: `create_pr_safe.py`, `fetch_comments.py` ported and bundled
- Linear issue cross-linking when both modes are active

### Out of Scope / Non-Goals

- GitHub Actions CI configuration or management
- PR approval workflows (CODEOWNERS, required reviewers)
- Cross-repo PRs or fork-based workflows
- PR templates managed outside Kata (`.github/pull_request_template.md` — Kata composes its own body)
- Draft PR workflows
- Automated merge policies (auto-merge when CI passes)

## Technical Constraints

- Depends on `gh` CLI installed and authenticated — must detect and guide user if missing
- PR body must use file-backed creation (`--body-file`) to prevent shell interpolation
- Reviewer subagents must receive identical diff/context for consistent results
- Preferences system from M002/S02 (or file-mode equivalent) must be available for PR config

## Integration Points

- `gh` CLI — all GitHub API operations (PR create, edit, view, merge, comment, review threads)
- Git — branch management, push, status
- Kata slice lifecycle — hook into task/slice completion for auto-PR creation
- Kata preferences — read/write PR configuration
- Kata subagent infrastructure — dispatch reviewer subagents
- Linear API (optional) — cross-link PRs to Linear issues when Linear mode is active

## Open Questions

- Should review findings be persisted as a Kata artifact (e.g., `S01-REVIEW.md`) or treated as ephemeral session output? — leaning ephemeral, but persisting critical/important findings could help across sessions
- Should `/kata pr review` run automatically on PR creation when `pr.review_on_create` is true, or should it always be a separate step? — leaning separate, auto-create + auto-review in one step may be too much magic
