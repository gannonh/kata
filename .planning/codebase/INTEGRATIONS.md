# External Integrations

**Analysis Date:** 2026-02-18

## APIs & External Services

**GitHub API:**
- Service: GitHub via official GitHub CLI (`gh`)
- What it's used for: Milestone creation, Issue management, PR creation/management, repository metadata
  - SDK/Client: GitHub CLI (`gh`) - external executable
  - Auth: GitHub token in user's local `gh` config (not Kata-managed)
  - Config keys: `github.enabled`, `github.issue_mode`
  - Scripts: `create-draft-pr.sh`, `get-phase-issue.sh`, `update-issue-checkboxes.sh`

**Git:**
- Service: Git version control via `git` CLI
- What it's used for: Repository operations, branch management, commits, push/pull
  - SDK/Client: Native `git` command
  - Auth: SSH keys or stored Git credentials

## Data Storage

**Databases:**
- None - All state stored in filesystem (Git)

**File Storage:**
- Local filesystem only - `.planning/` directory structure
- No cloud storage (S3, GCS, Dropbox, etc.)

**State Persistence:**
- Git-based: All state committed to repository
- Planning metadata: `.planning/config.json`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- Artifact directories: `.planning/phases/`, `.planning/codebase/`, `.planning/intel/`

**Caching:**
- GitHub milestone decisions cached in `.planning/STATE.md`
- Generated codebase intel in `.planning/intel/` (not auto-invalidated)

## Authentication & Identity

**Auth Provider:**
- GitHub CLI (`gh`) - User authenticates separately via `gh auth`
- No OAuth/SSO implementation in Kata (delegated to `gh`)
- Passwordless via GitHub token + SSH

**Implementation:**
- Scripts invoke `gh` commands; GitHub handles auth
- No credential storage or management in Kata
- Failures return empty values (silent via `2>/dev/null`)

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service

**Logs:**
- Test output via `node:test` reporter (human-readable terminal)
- Build logs to console in `scripts/build.js`
- No persistent logging system

## CI/CD & Deployment

**Hosting:**
- Claude Code plugin registry (Anthropic marketplace)
- Secondary: `gannonh/kata-skills` repository
- Fallback: `gannonh/kata-marketplace` repository

**CI Pipeline:**
- GitHub Actions via `.github/workflows/release.yml`
- Trigger: Push to main with version change
- Steps: Full test suite → build plugin → create release → publish to marketplace/registries
- Post-release verification via `gh release view` and GitHub API

**Deployment:**
- No runtime deployment (static plugin distribution)
- Users install via `/plugin install` or Claude Code marketplace
- Each installation independent (no server component)

## Environment Configuration

**Required env vars:**
- None - All configuration in `.planning/config.json`

**Optional env vars:**
- `KATA_PROJECT_ROOT` - Override project root detection (used by scripts)

**Configuration file:** `.planning/config.json`

**Key integration settings:**
- `github.enabled` (boolean, default: false) - Master toggle for GitHub integration
- `github.issue_mode` (string: "auto"|"ask"|"never") - When to create phase Issues
- `pr_workflow` (boolean) - Enable PR-based workflows
- `workflow` sections - Per-workflow custom commands

**Secrets location:**
- GitHub CLI manages credentials (external to Kata)
- No API keys/tokens stored by Kata

## Webhooks & Callbacks

**Incoming:**
- None - Kata does not expose HTTP endpoints

**Outgoing:**
- GitHub API calls (read/write) via `gh` CLI:
  - Create/list/close milestones
  - Create/update/list issues
  - Create/update/merge pull requests
  - Apply labels and assignments
  - No webhook registrations (polling-based status checks)

## Integration Points by Skill

**`kata-execute-phase`:**
- Creates draft PRs: `gh pr create --draft`
- Updates issue checkboxes: `gh issue edit`
- Queries phase issues: `gh api` (handles closed milestones with two-step lookup)
- Scripts involved: `create-draft-pr.sh`, `get-phase-issue.sh`, `update-issue-checkboxes.sh`

**`kata-add-milestone`:**
- Creates GitHub Milestone: `gh milestone create`
- Creates phase Issues: `gh issue create`
- Creates `phase` label: `gh label create`
- Config checked: `github.enabled`, `github.issue_mode`

**`kata-complete-milestone`:**
- Resolves milestone: `gh api` (title to number)
- Creates GitHub Release: `gh release create`
- Pushes to downstream repos via `git push`

**`kata-plan-phase`:**
- Reads milestone from ROADMAP.md (local only)
- No external API calls

**`kata-review-pull-requests`:**
- Lists/views PRs: `gh pr list`, `gh pr view`
- Reads reviews/comments: `gh api`

## GitHub Integration Modes

**When `github.enabled: true`:**

| Event | Skill | Action | Config |
|-------|-------|--------|--------|
| Project setup | `kata-new-project` | Ask about GitHub integration | N/A |
| Milestone created | `kata-add-milestone` | Create GitHub Milestone | `github.enabled` |
| Phase added | `kata-add-milestone` | Create phase Issue (conditional) | `github.enabled`, `github.issue_mode` |
| Phase executed | `kata-execute-phase` | Create draft PR, update issue | `github.enabled` |
| Milestone complete | `kata-complete-milestone` | Create GitHub Release | (reads) |

**Issue mode:**
- `auto` - All phase Issues created automatically
- `ask` - Prompt once per milestone; cache decision in STATE.md
- `never` - No phase Issues (Milestones still created if enabled)

**Error handling:**
- GitHub API failures are non-blocking
- Idempotent operations (existing resources skipped)
- Fallback: If `gh` auth fails, local-only mode activates

---

*Integration audit: 2026-02-18*
