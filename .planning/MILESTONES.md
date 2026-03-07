# Project Milestones: Kata Agents

## v0.6.1 Testing Infrastructure (Shipped: 2026-02-05)

**Delivered:** Baseline test coverage and live E2E testing capabilities with real credentials.

**Phases completed:** 1-2 (6 plans total)

**Key accomplishments:**

- Live E2E test suite with real credentials in isolated demo environment
- Auth, chat, session, git status, and permission mode E2E coverage
- Coverage reporting configured with threshold enforcement in CI
- Comprehensive test coverage gap analysis with documented rationale
- Demo environment tooling (setup, reset, repo, launch scripts)

**Stats:**

- 36 files created/modified (code), 124 total including planning
- 2,115 lines added, 88 removed (code only)
- 2 phases, 6 plans, 10 requirements
- 2 days from milestone start to ship (2026-02-04 to 2026-02-05)

**Git range:** `v0.6.0` to `v0.6.1`

**What's next:** v0.8.0 Kata Infrastructure

---

## v0.6.0 Git Integration (Shipped: 2026-02-04)

**Delivered:** Git context (branch, PR) displayed in workspace UI with real-time updates and AI context injection.

**Phases completed:** 3-7 (14 plans total)

**Key accomplishments:**

- Git branch display in workspace UI with real-time file watching via chokidar
- PR badge showing linked pull request title, status, and click-to-open in browser
- Focus-aware PR polling and automatic git status refresh on file system changes
- AI context injection: agent receives branch and PR info per user message
- Worktree and submodule support with gitdir pointer resolution
- Integration test suite for GitWatcher (10 tests, worktree validation, performance baseline)

**Stats:**

- 88 files created/modified
- 11,701 lines added (TypeScript/React)
- 5 phases, 14 plans, 12 requirements
- 3 days from milestone start to ship (2026-02-02 to 2026-02-04)

**Git range:** `v0.5.0` → `v0.6.0`

**What's next:** TBD

---

## v0.4.0 Foundation (Shipped: 2026-01-30)

**Delivered:** Full rebrand from Craft Agents to Kata Agents with CI/CD infrastructure and trademark compliance.

**Phases completed:** 1-2 (6 plans total)

**Key accomplishments:**

- Complete Kata Agents branding (icons, logos, React components)
- CI/CD workflows for PR validation and releases
- GitHub Releases distribution for all platforms
- macOS code signing and notarization support
- Upstream management documentation

**Stats:**

- 191 files changed
- 8,048 lines added, 837 removed
- 2 phases, 6 plans, 10 requirements
- Foundation milestone

**Git range:** fork → `v0.4.0`

**What's next:** v0.6.0 Git Integration

---
