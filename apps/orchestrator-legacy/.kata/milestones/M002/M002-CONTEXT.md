# M002: Claude Code Plugin — Context

**Gathered:** 2026-03-13
**Status:** Ready for planning (after M001 completes)

## Project Description

kata-orchestrator is a structured workflow system for AI coding agents. M002 builds the Claude Code Plugin distribution format and the foundational multi-version build system.

## Why This Milestone

Claude Code Plugin is the highest-priority distribution format. It is also the first milestone requiring a build system to generate a properly structured plugin artifact from the source. The build system established here will be extended in M003-M005.

## User-Visible Outcome

### When this milestone is complete, the user can:
- `claude plugin install ./kata-orchestrator` (or from marketplace)
- Use `/kata-orchestrator:kata` slash commands within Claude Code
- Skills are loaded and auto-invoked by Claude from the plugin namespace
- Agents defined in the plugin are available as subagents

### Entry point / environment
- Entry point: `claude --plugin-dir ./dist/claude-code-plugin` (dev) or `claude plugin install` (dist)
- Environment: Claude Code with plugin support (v1.0.33+)
- Live dependencies: Claude Code plugin system

## Completion Class

- Contract complete means: `.claude-plugin/plugin.json` valid; `skills/`, `agents/`, `commands/`, `hooks/` correctly structured; plugin loads without errors
- Integration complete means: `claude --plugin-dir ./dist/claude-code-plugin` starts and `/kata-orchestrator:help` runs
- Operational complete means: n/a

## Final Integrated Acceptance

- `claude --plugin-dir ./dist/claude-code-plugin` starts without errors
- `/kata-orchestrator:help` runs and produces output
- At least one skill is auto-invoked by Claude
- `npm run build` produces the plugin artifact from source

## Key Risks / Unknowns

- Claude Code Plugin API shape: skills, agents, hooks all have specific formats — the plugin-dev reference files at `/Users/gannonhall/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/skills/` are the ground truth
- Hook format in plugins differs from standalone hooks (hooks.json) — must verify
- Which kata workflows map cleanly to Claude Code skills vs commands vs agents

## Implementation Decisions

- Read `/Users/gannonhall/.claude/plugins/marketplaces/claude-plugins-official/plugins/plugin-dev/` before slice planning
- Build output goes to `dist/claude-code-plugin/`
- Build script: `scripts/build-plugin-claude.js`
- Plugin name: `kata-orchestrator` (namespace: `/kata-orchestrator:*`)
- Docs: https://code.claude.com/docs/en/plugins.md
