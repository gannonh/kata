# Kata

## What This Is

A spec-driven development framework for Claude Code. Brings structured, reliable AI development to teams without changing their existing tools. Teams use Kata's quality-producing process inside the tools they already love.

**Current state:** v0.1.5 shipped — 14 skills, 25 slash commands, test harness. Starting v0.1.9 Claude Code Plugin.

## Core Value

Teams get reliable AI-driven development without abandoning their existing GitHub workflow. Kata is additive — no convincing the boss, no workflow changes, just better outcomes.

## Requirements

### Validated

- Hard fork from upstream — v0.1.4 (independent identity, gannonh/kata)
- Skills architecture — v0.1.5 (14 skills as orchestrators, spawn sub-agents via Task tool)
- Slash command suite — v0.1.5 (25 commands delegating to skills)
- Test harness — v0.1.5 (CLI-based skill testing with `claude "prompt"`)

### Active (v0.1.10 GitHub Integration)

- [ ] Config-driven integration — enable/disable via .planning/config.json
- [ ] GitHub Milestone creation — milestone-new creates GH Milestone
- [ ] Phase issue creation — phases become GitHub Issues with `phase` label
- [ ] Plan checklist sync — plans shown as checklist items in phase issues
- [ ] PR creation at phase completion — phase-execute creates PR, auto-links with "Closes #X"
- [ ] Workflow audit — document integration points in existing Kata workflows

### Out of Scope

**Deferred to later milestones:**
- VS Code adapter — prove pattern in Claude Code first
- IDE Adapters (Cursor, Antigravity) — after VS Code
- Other integrations (Linear, Jira) — after GitHub proves pattern
- GitHub Project boards — later GitHub phase
- GitHub Actions/CI integration — later GitHub phase
- Native PR reviews (Claude reviews PRs) — later GitHub phase
- PR comment response — later GitHub phase

**Not building:**
- Building an IDE — coordination layer only, use existing tools
- Building an LLM — use Claude, not compete with it
- Building an agent framework — use platform-native capabilities (subagents, Skills, MCPs)

## Context

**v0.1.5 shipped (2026-01-22):**
- 468 files modified, 96k insertions
- 14 skills as orchestrators spawning sub-agents
- 25 slash commands with disable-model-invocation
- Test harness using `claude "prompt"` for skill verification
- Gerund naming convention for skills with exhaustive trigger phrases

**v0.1.4 shipped (2026-01-18):**
- 130 files modified, ~68k LOC (md, js, json, sh)
- Tech stack: Node.js installer, Claude Code slash commands, markdown workflows
- Complete rebrand from GSD to Kata with gannonh/kata identity

**Fork rationale:**
- Original GSD was firmly solo-dev focused
- Our vision diverged significantly toward team workflows
- Hard fork allows independent evolution without upstream constraints
- Clean break enables rebranding and architectural changes

**Market opportunity:**
- Teams adopting AI coding tools (Copilot, etc.) get inconsistent, low-quality output
- Code falls apart at scale — "vibecoding" has a bad reputation
- Kata solves this through context engineering — describe idea, system extracts what it needs
- CodeRabbit and similar tools show market demand for AI PR reviews
- Kata does reviews better (full context from requirements/research/plans, not just diff)

**Technical foundation:**
- User has proven Kata works in VS Code with bash scripts — needs productization
- Existing PR skills (pr-create, pr-review, pr-merge) demonstrate the workflow
- Industry aligning on standards: Agent Skills, MCP (now in Linux Foundation)
- Philosophy: use native platform capabilities, don't build abstraction layers that break

**Target users:**
- Small-medium teams using GitHub (maybe with Linear)
- Standardized on VS Code with Copilot
- Established PR-based workflow with some customization
- Frustrated with AI code quality issues
- Don't want to change their tooling

## Constraints

- **Architecture**: Hard fork — independent codebase, no upstream dependencies
- **Platform integration**: Use native capabilities (Skills/MCPs for VS Code, not custom abstraction)
- **Standards alignment**: Follow emerging standards (Agent Skills, MCP)

## Key Decisions

| Decision                              | Rationale                                                                    | Outcome       |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| ~~Start as extension, not hard fork~~ | ~~Maximize leverage of upstream velocity~~                                   | Superseded    |
| **Hard fork and rebrand**             | Vision diverged significantly; clean break enables independent evolution     | Good — v0.1.4 |
| **Skills as orchestrators**           | Skills contain full workflow logic, spawn sub-agents via Task tool           | Good — v0.1.5 |
| **Command delegation**                | Slash commands delegate to skills with disable-model-invocation              | Good — v0.1.5 |
| **Skill naming**                      | Gerund style with exhaustive triggers for autonomous matching                | Good — v0.1.5 |
| GitHub integration first              | Prove integration pattern before IDE adapters                                | — Pending     |
| Config-driven integrations            | Modular, can enable/disable without affecting core Kata                      | — Pending     |
| Phase-level PRs                       | One PR per phase (not per plan) — complete reviewable units                  | — Pending     |
| Kata Milestone → GH Milestone         | Use GitHub's native feature for version tracking                             | — Pending     |
| Phase → Issue, Plan → Checklist       | Right granularity — phases are coordination unit, plans are execution detail | — Pending     |

## Current Milestone: v0.1.9 Claude Code Plugin

**Goal:** Package and publish Kata as a Claude Code plugin for easy distribution

**Target features:**
- Plugin manifest (`.claude-plugin/plugin.json`) correctly configured
- Plugin directory structure (`commands/`, `agents/`, `skills/`, `hooks/`)
- All Kata components available through plugin namespace (`/kata:*`)
- Published to @gannonh Claude Code plugin marketplace repository
- Installation via `/plugin install kata@gannonh-plugins` documented
- Local testing via `--plugin-dir` validated

**Approach:**
- Restructure repository to match Claude Code plugin conventions
- Create `.claude-plugin/plugin.json` manifest
- Create marketplace repository with `marketplace.json`
- Test with `claude --plugin-dir ./` before publishing

---
*Last updated: 2026-01-22 — v0.1.9 milestone started*
