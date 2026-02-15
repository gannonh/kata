# Kata

## What This Is

A spec-driven development framework for Claude Code. Brings structured, reliable AI development to teams without changing their existing tools. Teams use Kata's quality-producing process inside the tools they already love.

**Current state:** v1.11.0 shipped. Phase-level worktrees with persistent `workspace/` directory. `main/` stays on main branch permanently.

## Core Value

Teams get reliable AI-driven development without abandoning their existing GitHub workflow. Kata is additive — no convincing the boss, no workflow changes, just better outcomes.

## Requirements

### Validated

- Hard fork from upstream — v0.1.4 (independent identity, gannonh/kata)
- Skills architecture — v0.1.5 (14 skills as orchestrators, spawn sub-agents via Task tool)
- Slash command suite — v0.1.5 (25 commands delegating to skills)
- Test harness — v0.1.5 (CLI-based skill testing with `claude "prompt"`)
- Claude Code plugin — v1.0.0 (plugin manifest, marketplace distribution)
- Skill self-containment — v1.0.6 (skills bundle own resources, no shared kata/ dependencies)
- Config-driven integration — v1.1.0 (enable/disable via .planning/config.json)
- GitHub Milestone creation — v1.1.0 (milestone-new creates GH Milestone)
- Phase issue creation — v1.1.0 (phases become GitHub Issues with `phase` label)
- Plan checklist sync — v1.1.0 (plans shown as checklist items in phase issues)
- PR creation at phase completion — v1.1.0 (phase-execute creates PR, auto-links with "Closes #X")
- Workflow audit — v1.1.0 (integration points documented in github-integration.md)
- Plugin-only distribution — v1.1.0 (NPX deprecated, 27 skills renamed)
- Release automation — v1.3.0 (changelog generation, version detection, PR workflow)
- Internal documentation — v1.3.3 (workflow diagrams, terminology glossary)
- Issue model — v1.4.0 (rename todos → issues, local + GitHub sync)
- PR→Issue closure — v1.4.1 (phase, milestone, and issue execution PRs auto-close GitHub Issues)
- Issue execution workflow — v1.4.1 (mode selection: quick task vs planned, PR with Closes #X)
- Issue→roadmap integration — v1.4.1 (pull issues into milestones and phases, source_issue traceability)
- Phase state directories — v1.5.0 (pending/, active/, completed/ with automatic transitions)
- Phase movement — v1.5.0 (cross-milestone moves, within-milestone reorder, per-milestone numbering)
- Roadmap formatting — v1.5.0 (Planned Milestones section, standardized details blocks, format conventions)
- Skill resource pattern — v1.6.0 (agent instructions in skill references/, inlined into subagent prompts)
- Custom subagent elimination — v1.6.0 (all 19 kata:kata-* types replaced with general-purpose)
- Migration validation tests — v1.6.0 (automated compliance verification in npm test)
- Agent Skills spec compliance — v1.6.0 (29 SKILL.md files normalized to spec)
- skills.sh distribution — v1.6.0 (dual-channel: plugin marketplace + gannonh/kata-skills)
- Globally sequential phase numbering — v1.6.0 (unique across all milestones)
- Brainstorm skill — v1.7.0 (explorer/challenger agent teams for structured ideation)
- Workflow integration — v1.7.0 (optional brainstorm step in 5 workflows)
- Agent Teams prerequisite — v1.7.0 (auto-detect and enable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS)
- Brainstorm context injection — v1.7.0 (SUMMARY.md feeds into planner and researcher agents)

- Preferences storage — v1.8.0 (preferences.json with accessor scripts for project-lifetime constants)
- Progressive capture — v1.8.0 (reduce onboarding to 5 questions, defer remaining to first encounter)
- Template overrides — v1.8.0 (project-local templates override plugin defaults for output formats)
- Config workflow variants — v1.8.0 (per-skill workflows section for project-specific commands)

- Universal template resolution — v1.9.0 (sibling discovery works for plugin and skills-only installations)
- In-skill validation — v1.9.0 (template drift and config validation moved from hooks into skills)
- Template customization UI — v1.9.0 (/kata-customize for listing, copying, editing, validating overrides)
- Template system tests — v1.9.0 (resolution, drift detection, override behavior test suite)
- Template documentation — v1.9.0 (schema reference, migration guide, README section)

- Git worktree support — v1.10.0 (plan-level agent isolation via git worktrees)
- Config nested key reader — v1.10.0 (read-config.sh for nested JSON keys)
- Worktree execution integration — v1.10.0 (per-plan worktrees during phase execution)
- Worktree-aware downstream skills — v1.10.0 (milestone completion, git integration docs)

- Phase-level worktrees — v1.11.0 (create phase worktree instead of checkout in main/)
- Main branch protection — v1.11.0 (main/ worktree stays on main branch permanently)
- Phase worktree merge target — v1.11.0 (plan merges target phase worktree, not main/)
- Phase worktree cleanup — v1.11.0 (remove phase worktree after merge/PR)

### Active

(None — define with `/kata-add-milestone`)

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

## Current Milestone: None

Next milestone TBD. Use `/kata-add-milestone` to start planning.

## Context

**v1.11.0 shipped (2026-02-14):**
- 61 files changed, 6,421 insertions, 391 deletions
- Phase-level worktrees: `workspace/` as persistent working directory, `main/` stays read-only on main branch
- Two-tier worktree model: plan worktrees fork from phase branch, merge back to phase worktree
- Worktree-safe PR merge patterns across all 4 affected skills
- Full test coverage for workspace model across all worktree scripts

**v1.10.0 shipped (2026-02-12):**
- 98 files changed, 7,199 insertions, 1,116 deletions
- Config foundation with `worktree.enabled` setting and `read-config.sh` for nested JSON keys
- Git worktree lifecycle management via `manage-worktree.sh` (create, merge, list subcommands)
- Bare repo conversion and worktree setup scripts
- Wave-based execution integration with per-plan worktree isolation
- Worktree-aware release branch creation in milestone completion
- Comprehensive test suite for all new worktree scripts
- Active post-release task offerings replacing passive checklist

**v1.9.0 shipped (2026-02-08):**
- 71 files changed, 5,610 insertions, 527 deletions
- Universal template resolution via sibling discovery (works for all install methods)
- Validation migrated from SessionStart hooks into skills (template drift + config)
- `/kata-customize` skill for template override management
- All templates converted to YAML frontmatter with schema documentation
- Template system test suite and comprehensive docs

**v1.8.0 shipped (2026-02-08):**
- 92 files changed, 9,921 insertions, 1,321 deletions
- Preferences infrastructure with `read-pref.sh`, `has-pref.sh`, `set-config.sh` accessor scripts
- Progressive capture reducing onboarding from 11 to 5 questions
- Template overrides with project-local templates and drift detection
- Config workflow variants with per-skill `workflows` section in config.json
- kata-doctor skill for project health checks

**v1.7.0 shipped (2026-02-07):**
- 77 files changed, 4,319 insertions, 571 deletions
- kata-brainstorm skill with explorer/challenger Agent Teams and Kata-aware context assembly
- Agent Teams prerequisite detection with auto-enable via settings.json
- Brainstorm gates in 5 workflows (add-milestone, new-project, discuss-phase, research-phase, plan-phase)
- Brainstorm SUMMARY.md auto-feeds into planner and researcher agents as downstream context
- All brainstorm integration points non-blocking (skip continues parent workflow)

**v1.6.0 shipped (2026-02-06):**
- 446 files changed, 15,114 insertions, 4,282 deletions
- 19 custom agent types migrated to skill resources with general-purpose subagent spawning
- Dual distribution: plugin marketplace + skills.sh via gannonh/kata-skills
- 29 SKILL.md files normalized to Agent Skills spec with automated validation
- Phase numbering reverted to globally sequential (unique across milestones)
- agents/ directory removed; instructions self-contained in skill references/

**v1.5.0 shipped (2026-02-04):**
- 88 files changed, 4,618 insertions, 226 deletions
- Phase state directories with universal discovery pattern across all skills/agents
- Cross-milestone phase movement and within-milestone reordering
- Per-milestone phase numbering starting at 1
- Standardized roadmap formatting with Planned Milestones section

**v1.4.1 shipped (2026-02-03):**
- 152 files changed, 6,941 insertions, 651 deletions
- Complete issue lifecycle: creation → execution → PR → auto-closure
- Source issue traceability: issue → plan → PR → closure chain
- All skill names prefixed with `kata-` for consistent namespacing
- Skill descriptions cleaned of filler phrases

**v1.4.0 shipped (2026-02-01):**
- Bidirectional GitHub Issue integration with automatic labeling
- Issue vocabulary normalized (todos → issues)
- Skills-first architecture (commands wrapper removed)

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
| GitHub integration first              | Prove integration pattern before IDE adapters                                | Good — v1.1.0 |
| Config-driven integrations            | Modular, can enable/disable without affecting core Kata                      | Good — v1.1.0 |
| Phase-level PRs                       | One PR per phase (not per plan) — complete reviewable units                  | Good — v1.1.0 |
| Kata Milestone → GH Milestone         | Use GitHub's native feature for version tracking                             | Good — v1.1.0 |
| Phase → Issue, Plan → Checklist       | Right granularity — phases are coordination unit, plans are execution detail | Good — v1.1.0 |
| Plugin-only distribution              | Simplify maintenance, NPX deprecated                                         | Good — v1.1.0 |
| Issue lifecycle via PR closure        | `Closes #X` in PR body handles all closure paths consistently               | Good — v1.4.1 |
| Source issue traceability             | Plans reference source issues for audit trail from issue to PR              | Good — v1.4.1 |
| kata- prefix on all skill names       | Consistent namespacing, avoids collisions with built-in behaviors           | Good — v1.4.1 |
| Phase state directories               | Organize artifacts under pending/active/completed for lifecycle clarity    | Good — v1.5.0 |
| Universal find-based discovery         | zsh-safe, supports both flat and state directories                         | Good — v1.5.0 |
| ~~Per-milestone phase numbering~~      | ~~Independent numbering avoids cross-milestone confusion~~                 | Reverted — v1.6.0 |
| Globally sequential phase numbering    | Unique prefixes prevent lookup collisions across milestones               | Good — v1.6.0 |
| Skill resource pattern                 | Agent instructions in references/, inlined at spawn time for portability  | Good — v1.6.0 |
| general-purpose subagent type          | Standard type eliminates custom agent dependency, portable across platforms | Good — v1.6.0 |
| Dual distribution (marketplace + skills.sh) | Two install channels without maintaining separate codebases          | Good — v1.6.0 |
| Agent Skills spec normalization        | SKILL.md frontmatter follows spec for cross-platform compatibility       | Good — v1.6.0 |

## Shipped: v1.11.0 Phase-Level Worktrees

**Delivered:** Phase-level worktree architecture so `main/` stays on the main branch permanently, with persistent `workspace/` as the working directory.

**Key accomplishments:**
- Phase-level worktrees replace `git checkout -b` in `main/`, keeping `main/` on the main branch permanently
- Workspace worktree architecture with persistent `workspace/` as working directory and read-only `main/`
- Two-tier worktree model: plan worktrees fork from phase branch, merges target phase worktree
- Worktree-safe PR merge patterns across all 4 affected skills
- Full test coverage for workspace model across all worktree scripts

See `.planning/milestones/v1.11.0-ROADMAP.md` for full archive.

## Shipped: v1.10.0 Git Worktree Support

**Delivered:** Optional git worktree support for plan-level agent isolation during phase execution, with config foundation, lifecycle management, wave-based execution integration, and comprehensive test coverage.

**Key accomplishments:**
- Config foundation with `worktree.enabled` setting and `read-config.sh` for nested JSON keys
- Git worktree lifecycle management via `manage-worktree.sh` (create, merge, list subcommands)
- Bare repo conversion and worktree setup scripts
- Wave-based execution integration with per-plan worktree isolation and automatic branch merging
- Worktree-aware downstream skills (release branch creation, two-tier branch flow docs)
- Comprehensive test suite for all new worktree scripts and infrastructure
- Active post-release verification task offerings

See `.planning/milestones/v1.10.0-ROADMAP.md` for full archive.

## Shipped: v1.7.0 Brainstorm Integration

**Delivered:** Structured explorer/challenger brainstorming via Agent Teams, wired into 5 existing workflows as an optional step with downstream context injection.

**Key accomplishments:**
- kata-brainstorm skill with explorer/challenger Agent Teams for structured ideation
- Agent Teams prerequisite detection with auto-enable via settings.json
- Kata-aware context assembly from PROJECT.md, ROADMAP.md, open issues, STATE.md
- Brainstorm gates in 5 workflows (add-milestone, new-project, discuss-phase, research-phase, plan-phase)
- Brainstorm SUMMARY.md auto-feeds into planner and researcher agents

See `.planning/milestones/v1.7.0-ROADMAP.md` for full archive.

## Shipped: v1.9.0 Template Overrides (Universal)

**Delivered:** Universal template override infrastructure with portable resolution, in-skill validation, template customization UI, and full documentation.

**Key accomplishments:**
- Universal template resolution via sibling discovery, works for plugin and skills-only installations
- `/kata-customize` skill for listing, copying, editing, and validating template overrides
- Validation migrated from SessionStart hooks into skills
- Template system test suite covering resolution, drift detection, and override behavior
- All default templates converted to YAML frontmatter with schema documentation
- Comprehensive template customization docs and hooks-to-skills migration guide

See `.planning/milestones/v1.9.0-ROADMAP.md` for full archive.

## Shipped: v1.8.0 Adaptive Workflows

**Delivered:** Project-specific workflow customization through preferences storage, progressive capture, template overrides, and config-driven workflow variants.

**Key accomplishments:**
- Preferences infrastructure with `read-pref.sh`, `has-pref.sh`, `set-config.sh` accessor scripts
- Progressive capture reducing onboarding from 11 to 5 questions with check-or-ask pattern
- Template overrides with project-local templates in `.planning/templates/`
- Template drift detection SessionStart hook
- Config workflow variants with `workflows` section for per-skill customization
- Config validator hook warning on unknown keys and erroring on invalid types
- kata-doctor skill for project health checks

See `.planning/milestones/v1.8.0-ROADMAP.md` for full archive.

## Shipped: v1.5.0 Phase Management

**Delivered:** Phase state directories, cross-milestone phase movement, per-milestone numbering, and standardized roadmap formatting.

**Key accomplishments:**
- Universal phase discovery pattern with state-aware `find` across all skills and agents
- Phase state directories (`pending/`, `active/`, `completed/`) with automatic transitions
- `/kata-move-phase` for cross-milestone moves and within-milestone reordering
- Per-milestone phase numbering starting at 1 (independent per milestone)
- Roadmap format standardization with Planned Milestones section

See `.planning/milestones/v1.5.0-ROADMAP.md` for full archive.

## Shipped: v1.4.1 Issue Execution

**Delivered:** Complete issue lifecycle with execution workflows, PR auto-closure, roadmap integration, and plan-phase issue context wiring.

**Key accomplishments:**
- PR→Issue auto-closure for phase execution, milestone completion, and issue execution PRs
- Issue execution workflow with mode selection (quick task vs planned)
- Issue→roadmap integration: pull backlog issues into milestones and phases
- Source issue traceability chain from issue→plan→PR→closure
- Plan-phase issue context wiring for automated source_issue in generated plans

See `.planning/milestones/v1.4.1-ROADMAP.md` for full archive.

## Shipped: v1.4.0 GitHub Issue Sync

**Delivered:** Bidirectional GitHub Issue integration with automatic labeling, assignment, and lifecycle management.

**Key accomplishments:**
- GitHub Issue creation/pull with automatic label sync
- Issue execution linking with auto-close
- Issue vocabulary normalized (todos → issues)

See `.planning/milestones/v1.4.0-ROADMAP.md` for full archive.

## Shipped: v1.1.0 GitHub Integration

**Delivered:** Config-driven GitHub Milestone, Issue, and PR workflows. Plugin-only distribution.

**Key accomplishments:**
- GitHub Milestone/Issue/PR integration with auto-linking
- Test harness with 27 skill tests and CI/CD integration
- PR review workflow with 6 specialized agents
- Deprecate NPX, simplify to plugin-only

See `.planning/milestones/v1.1.0-ROADMAP.md` for full archive.

## Shipped: v1.6.0 Skills-Native Subagents

**Delivered:** All 19 custom agent types migrated to skill resources. Kata is portable across Agent Skills-compatible platforms. Dual distribution via plugin marketplace and skills.sh.

**Key accomplishments:**
- Skill resource pattern: agent instructions in `skills/*/references/`, inlined into subagent prompts
- All custom `kata:kata-*` subagent types replaced with standard `general-purpose`
- Automated migration validation tests ensuring compliance
- skills.sh distribution channel via `gannonh/kata-skills`
- Agent Skills spec normalization across 29 SKILL.md files
- Globally sequential phase numbering replacing per-milestone numbering

See `.planning/milestones/v1.6.0-ROADMAP.md` for full archive.

---
*Last updated: 2026-02-14 after v1.11.0 milestone*
