# Platform Expansion Ideas

Explorer: explorer-platform
Date: 2026-02-07

---

## 1. MCP Server for Kata State

**What:** Expose Kata's `.planning/` state as an MCP server. Other tools (dashboards, IDE extensions, CI pipelines) can query project status, phase progress, issue state, and roadmap data through a standardized protocol.

**Why:** MCP is becoming the standard interface for tool interop (now in Linux Foundation). Kata already has rich structured state in `.planning/` (STATE.md, ROADMAP.md, config.json, issues, summaries). Exposing this through MCP makes Kata a data provider for any MCP-compatible consumer without writing custom integrations for each. A team lead could connect a Slack bot, a web dashboard, or a CI check to Kata state through one protocol.

**Scope:** Medium. Build an MCP server (TypeScript/Node) that reads `.planning/` artifacts and exposes resources (project status, phase list, issue list) and tools (get-phase-status, list-open-issues). Distribute alongside the plugin.

**Risks:**
- MCP spec still evolving; API could change
- Server needs to stay in sync with `.planning/` format changes
- Additional runtime dependency (Node process) running alongside Claude Code
- Adoption depends on MCP ecosystem maturity

---

## 2. GitHub Actions Integration

**What:** Ship a `kata-ci` GitHub Action that validates Kata artifacts in CI. Checks include: PLAN.md structural validity, SUMMARY.md completeness, commit message convention adherence, phase numbering consistency, and config.json schema validation.

**Why:** Kata currently has no CI presence. All validation happens locally in Claude Code. A GitHub Action lets teams enforce Kata conventions on PRs automatically. It also makes Kata visible in the GitHub ecosystem (Actions Marketplace), which is a distribution channel for discovery. Teams already running CI get Kata guardrails "for free."

**Scope:** Medium. Build a composite action that runs validation scripts against `.planning/` directory. Publish to GitHub Actions Marketplace. Add a `kata-setup-ci` skill that generates the workflow file for a project.

**Risks:**
- Maintaining the Action as a separate artifact alongside plugin/skills-sh distributions
- Validation logic duplicated between Action and local hooks
- False positives could frustrate teams (noisy CI checks)
- Action Marketplace discoverability is competitive

---

## 3. Linear Integration (Phase 1: Read-Only Sync)

**What:** Add Linear as a second project management backend alongside GitHub Issues. Phase 1 is read-only: pull Linear issues into Kata's `.planning/issues/` directory, display Linear project status in `/kata-track-progress`. No write-back in Phase 1.

**Why:** Linear is the second most popular project tracker for the target audience (small-medium dev teams). The open issue for Linear research already exists. A read-only first phase de-risks the integration: teams can see their Linear backlog inside Kata without trusting Kata to modify Linear state. This follows the same incremental pattern that worked for GitHub (config toggle, then read, then write).

**Scope:** Medium. Linear has a GraphQL API. Build a `linear.*` config section mirroring `github.*`. Add Linear pull to `/kata-check-issues`. Display in progress tracking.

**Risks:**
- Linear API authentication adds complexity (OAuth vs API key)
- Concept mapping is imperfect (Linear cycles vs Kata milestones, Linear projects vs Kata milestones)
- Maintaining two integration backends increases surface area
- Teams using both Linear and GitHub Issues create ambiguity about source of truth

---

## 4. GitHub Project Board Sync

**What:** Extend the existing GitHub integration to sync Kata phases and plans with GitHub Project boards (v2). Create board items for phases, auto-move items between columns (Pending, Active, Completed) as Kata phases transition through state directories.

**Why:** GitHub Projects v2 is where many teams track work visually. Kata already creates Milestones and Issues but skips Projects. Adding board sync gives stakeholders (PMs, leads) a visual dashboard of Kata progress without leaving GitHub. This is a natural extension of the existing integration, not a new backend.

**Scope:** Small-Medium. GitHub Projects v2 uses GraphQL. Add `github.projectBoard` config key. Hook into phase state transitions (pending -> active -> completed) to move board items.

**Risks:**
- GitHub Projects v2 GraphQL API is verbose and sometimes inconsistent
- Board column names need to match Kata state directory names (or be configurable)
- Rate limiting on GraphQL mutations during large phase transitions
- Some teams don't use Projects, so this is a subset benefit

---

## 5. Kata Template Registry

**What:** Create a registry of project templates (beyond the current generic PLAN.md/PROJECT.md templates). Templates would include pre-configured skills, reference docs, and planning scaffolds for specific project types: API service, CLI tool, web app, library, monorepo.

**Why:** The biggest friction in Kata adoption is `kata-new-project` setup. Users have to figure out which skills matter for their project type. A template registry lets users start with `kata-new-project --template api-service` and get sensible defaults: GitHub integration enabled, relevant issue labels, roadmap structure sized for an API, reference docs about REST conventions. This lowers the barrier to first value.

**Scope:** Medium. Design template format, build 3-5 initial templates, add `--template` flag to `kata-new-project`, create a `kata-templates` repo for community contributions.

**Risks:**
- Template maintenance burden as Kata evolves
- Templates could become stale if not versioned with Kata releases
- Opinionated templates might not match team conventions
- Too many templates creates choice paralysis

---

## 6. Webhook/Event System for External Tools

**What:** Add an event emission layer to Kata hooks. When phases transition, plans complete, milestones ship, or issues close, Kata emits structured events to a configurable webhook URL. External tools (Slack, Discord, dashboards, CI) can subscribe.

**Why:** Teams want visibility into Kata progress without being in Claude Code. A webhook system is the lowest-friction integration point: any tool that can receive HTTP POST can subscribe. Slack notifications on phase completion, Discord alerts on milestone ship, dashboard updates on plan progress. This turns Kata from a Claude Code-only tool into a project coordination hub.

**Scope:** Medium-Large. Extend the hooks system to emit HTTP events. Define event schema (phase.started, phase.completed, plan.completed, milestone.shipped). Add `webhooks` config section. Build a Slack notification template as the reference consumer.

**Risks:**
- Webhook reliability (retries, failures, dead letter handling)
- Security of webhook URLs (secrets management in config.json)
- Event schema versioning as Kata evolves
- Claude Code sessions are ephemeral; events only fire during active sessions
- Debugging webhook delivery issues is painful for users

---

## 7. Cross-Project Kata Dashboard (Web)

**What:** Build a lightweight web dashboard that aggregates Kata state across multiple projects. Shows milestone progress, active phases, open issues, and recent activity for all Kata-managed repos in one view.

**Why:** As teams adopt Kata across multiple repos, there is no single view of "what's happening across all our projects." Each project's `.planning/` directory is isolated. A dashboard solves the "portfolio view" problem. This also serves as a showcase for Kata's structured data advantage: because Kata produces machine-readable artifacts (YAML frontmatter, structured SUMMARY.md, config.json), aggregation is straightforward.

**Scope:** Large. Requires a web app (likely static site + API that reads `.planning/` from multiple repos via GitHub API). Authentication, multi-repo support, state aggregation logic.

**Risks:**
- Significant scope increase beyond CLI plugin
- Hosting and authentication add operational burden
- GitHub API rate limits when polling multiple repos
- Competes with GitHub's own project views and third-party dashboards
- Could distract from core CLI value proposition
