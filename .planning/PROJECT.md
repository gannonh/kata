# Kata

## What This Is

A hard fork of GSD, rebranded and restructured for team workflows. Brings structured, reliable AI development to teams without changing their existing tools. Adapts the Kata workflow to VS Code and GitHub's native capabilities. Teams use Kata's quality-producing process inside the tools they already love.

## Core Value

Teams get reliable AI-driven development without abandoning their existing GitHub workflow. Kata is additive — no convincing the boss, no workflow changes, just better outcomes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] VS Code support — full Kata workflow running natively using Skills/MCPs/extensions
- [ ] GitHub Issues sync — bidirectional sync between Kata milestones/phases and GitHub issues
- [ ] Auto PR creation — execute-phase automatically creates PRs
- [ ] Native PR reviews — Claude reviews PRs, posts comments directly to GitHub (replaces CodeRabbit)
- [ ] PR comment response — Claude reads team PR feedback and addresses it
- [ ] Plugin architecture — extensible system so teams can build their own integrations

### Out of Scope

- Other IDE Adapters (Cursor, Antigravity) — v2, VS Code first proves the pattern
- Other Integrations (Linear, Jira) — v2, GitHub first proves integration architecture
- Building an IDE — coordination layer only, use existing tools
- Building an LLM — use Claude, not compete with it
- Building an agent framework — use platform-native capabilities (subagents, Skills, MCPs)

## Context

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

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| ~~Start as extension, not hard fork~~ | ~~Maximize leverage of upstream velocity~~ | Superseded |
| **Hard fork and rebrand** | Vision diverged significantly; clean break enables independent evolution | Active |
| VS Code first, other IDEs later | Proves the adaptation pattern, largest market share | — Pending |
| GitHub plugin first | Most teams use GitHub, validates plugin architecture | — Pending |
| Native PR reviews (not CodeRabbit) | Full GSD context makes reviews smarter than diff-only tools | — Pending |
| Plugin architecture from v1 | Teams can extend without waiting for us, enables ecosystem | — Pending |

---
*Last updated: 2026-01-17 — hard fork decision*
