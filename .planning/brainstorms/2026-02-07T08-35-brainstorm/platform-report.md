# Platform Expansion Report

Explorer: explorer-platform
Challenger: challenger-platform
Date: 2026-02-07
Rounds: 3

---

## Recommended v1.8.0 Slate

Four deliverables, estimated 6-8 phases total. Consistent with recent milestone sizing (v1.6.0: 5 phases, v1.1.0: 10 phases).

### 1. MCP Server for Kata State (Phase 1)

**What:** A stdio-based MCP server that Claude Code launches via its native MCP config. Exposes read-only Kata project state as structured resources. No external consumers in Phase 1.

**Architecture:**
- TypeScript/Node MCP server using the MCP SDK
- Launched by Claude Code via project-level `.claude/settings.json` MCP server config
- Reads `.planning/` directory artifacts and serves structured data
- Phase 1 registration: a `kata-setup-mcp` step (or addition to `kata-new-project`) writes the MCP server config entry

**Resource Schema (Phase 1):**

| Resource URI | Source | Returns |
|---|---|---|
| `kata://project/state` | STATE.md | Current milestone, active phase, recent decisions |
| `kata://phases` | State directories + ROADMAP.md | Phase list with status (pending/active/completed) |
| `kata://issues/open` | `.planning/issues/open/*.md` | Open issue titles, areas, priorities |
| `kata://config` | `.planning/config.json` | Current configuration |

**Tools (Phase 1):**

| Tool | Description |
|---|---|
| `get-phase-detail` | Returns full phase info (goal, plans, status) for a given phase number |
| `get-milestone-progress` | Returns milestone completion stats |

**Why:** MCP is in Kata's stated constraints ("use native platform capabilities"). The `.planning/` directory contains structured data that other tools (dashboards, bots, CI) could consume through a standard protocol. Phase 1 stays within Claude Code's ecosystem. Phase 2 (future) opens to external MCP consumers.

**Scope:** Medium. 2-3 phases (schema design + implementation, integration testing, registration/setup).

**Risks:**
- MCP SDK and spec still evolving
- Resource schema needs to track `.planning/` format changes
- Registration step adds onboarding friction (mitigated by automation in setup skill)

**Phase 2 (future):** HTTP transport for external consumers, write tools (create issue, update config), event subscriptions.

---

### 2. GitHub Actions Validation (Phase 0 + Phase 1)

**What:** Extract Kata artifact validation into standalone modules (Phase 0), then ship a GitHub Action that runs structural validation on PRs (Phase 1).

**Phase 0 - Validation Extraction:**
- Extract validation logic from implicit skill behavior into standalone Node scripts
- Checks: PLAN.md frontmatter validity, SUMMARY.md completeness, commit convention adherence, phase numbering consistency, config.json schema validation
- Runnable locally: `node scripts/validate.js` or via a `kata-validate` skill
- Dual benefit: improves local dev experience AND enables CI Action

**Phase 1 - GitHub Action:**
- Composite Action that runs validation scripts against `.planning/` directory
- Structural checks only (file existence, frontmatter, numbering). Semantic validation (does plan match phase goal?) deferred.
- Published to GitHub Actions Marketplace
- `kata-setup-ci` skill generates the workflow file for a project

**Why:** Kata has no CI presence. Teams running GitHub Actions get Kata guardrails on PRs automatically. The Actions Marketplace provides a discovery channel for Kata's target audience (small-medium teams using GitHub).

**Scope:** Medium. 2-3 phases (validation extraction, Action build + test, marketplace publish).

**Risks:**
- Validation logic maintenance alongside skill evolution
- Action naming and description need deliberate search optimization for Marketplace discoverability
- False positives in structural checks could frustrate teams

**Naming note:** The Action name should target search terms like "AI development validation", "spec-driven development", "planning artifact validation." This is a marketing decision, not an afterthought.

---

### 3. Linear Integration Research (Document Only)

**What:** Complete the existing open issue (linear-integration-research). Produce a concept mapping document and architecture proposal. No code, no API client, no config keys.

**Deliverable:** A research document covering:
- Linear API capabilities and authentication model (OAuth vs API key)
- Concept mapping table: Linear primitives to Kata primitives
- Architecture proposal for read-only Phase 1 integration
- Identified blockers and open questions
- Multi-milestone implementation arc estimate (GitHub integration took v1.1.0 through v1.4.1, four milestones)

**Concept mapping challenges to resolve:**
- Linear cycles are time-boxed; Kata milestones are scope-boxed
- Linear projects serve multiple organizational purposes (epics, product areas, teams)
- Linear has no direct equivalent to GitHub Milestones
- Issue/phase mapping: Linear issues to Kata phases vs Kata issues

**Why:** De-risks v1.9.0 implementation. Low cost (1 phase of research output). Closes an existing backlog issue.

**Scope:** Small. 1 phase (document output only).

**Decision gate:** The research output is a decision gate for v1.9.0, not a green light for immediate implementation. The document will inform whether Linear integration belongs in v1.9.0 or requires further prerequisite work.

**Risks:**
- Scope creep from "research" to "just build it while we're here"
- Concept mapping may reveal that clean integration requires Kata-side architectural changes

---

### 4. Smarter Onboarding Presets

**What:** Add project type presets to `kata-new-project`. Instead of asking users to configure each option individually, ask "What kind of project?" and set sensible defaults.

**Preset Configurations:**

| Preset | github.enabled | pr_workflow | depth | Default labels | Notes |
|---|---|---|---|---|---|
| API service | true | true | standard | api, endpoint, schema | REST/GraphQL API backends |
| Web app | true | true | standard | ui, page, component | Frontend or full-stack web |
| Library/package | true | true | quick | api, docs, test | Published npm/pip/etc packages |
| Custom | (ask) | (ask) | (ask) | (ask) | Current behavior, full manual config |

**What each preset configures:**
- `config.json` defaults (github settings, pr_workflow, depth)
- Initial issue labels (created if github.enabled)
- Default milestone structure suggestion in ROADMAP scaffold

**What presets do NOT configure:**
- Custom ROADMAP templates (same template, different defaults)
- Reference docs (not project-type-specific)
- Skill selection (all skills available regardless of preset)

**Why:** New users face a cold start problem. The current setup asks questions that require knowing Kata's config model. Presets let users express intent ("I'm building an API") and get working defaults. Power users choose "Custom" for full control.

**Scope:** Small. 1 phase (modifications to existing `kata-new-project` skill).

**Risks:**
- Presets may not match actual team conventions (mitigated by "Custom" escape hatch)
- Preset defaults need updating as Kata's config model evolves

---

## Housekeeping Item

### Version Detection Fix (Issue #112)

The dual-distribution model (plugin + skills.sh) has a known bug where skills-based installs report incorrect versions. This affects platform credibility. Small scope, directly relevant to distribution channel health. Should be included in v1.8.0 as a bug fix, not a feature.

---

## Deliberate Non-Inclusions

### PR Review Skill Evolution
`kata-review-pull-requests` is Kata's most externally visible feature and the most likely to attract new users. PROJECT.md lists "Native PR reviews" and "PR comment response" as deferred. The v1.8.0 slate does not include PR review enhancements because the current 6-agent review skill works as shipped. Improvements to this skill (responding to PR comments, native GitHub PR review API integration) are high-value but represent a separate focus area from platform expansion infrastructure. Recommend a dedicated milestone for PR review evolution after v1.8.0 ships.

### GitHub Project Board Sync
Evaluated and deferred. The GitHub Projects v2 GraphQL API requires raw `gh api graphql` mutations, breaking the `gh` CLI pattern used in all existing GitHub integration. Disproportionate maintenance burden for the value delivered. Teams get most board-level visibility from the existing Milestone + Issue integration. Revisit after MCP server ships (MCP provides board-equivalent visibility through a standards-based protocol).

### Webhook/Event System
Evaluated and rejected. Claude Code sessions are ephemeral. Push-based events from an ephemeral context create false reliability expectations. The MCP server (pull-based) solves the same external tool integration use case more soundly.

### Cross-Project Dashboard
Evaluated and rejected. Building a web app with authentication, hosting, and multi-repo aggregation contradicts the core constraint of using native platform capabilities. If portfolio visibility matters, an MCP-compatible dashboard client consuming the MCP server from idea #1 is the correct architecture.

### Template Registry
Evaluated and replaced by onboarding presets (idea #4). A separate registry with community contributions presumes a community that does not exist. The same UX improvement is achievable within `kata-new-project` itself at a fraction of the cost and maintenance burden.

---

## Implementation Sequencing

Recommended order based on dependencies and value delivery:

1. **Version detection fix** (housekeeping, unblocks distribution credibility)
2. **Validation extraction** (Phase 0 of GitHub Actions, also improves local dev)
3. **MCP Server Phase 1** (primary platform deliverable)
4. **GitHub Action Phase 1** (depends on validation extraction)
5. **Onboarding presets** (independent, small, quick win)
6. **Linear research** (independent, small, de-risks future milestone)

Items 3-6 have no hard dependencies on each other and could run in parallel where team capacity allows.
