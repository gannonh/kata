# M004: Cursor Plugin — Context

**Gathered:** 2026-03-13
**Status:** Provisional (planning begins after M003 completes)

## Project Description

kata-orchestrator is a structured workflow system for AI coding agents. M004 extends the multi-version build system to produce a Cursor Plugin distribution.

## Why This Milestone

Cursor is the third-priority distribution target. Like M002 (Claude Code Plugin), this requires a valid `.cursor-plugin/plugin.json` manifest and correctly structured plugin directories.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Install kata-orchestrator as a Cursor plugin
- Use kata skills, agents, rules, and commands inside Cursor IDE
- `npm run build` produces Claude Code Plugin + Codex + Cursor distributions

### Entry point / environment
- Entry point: Cursor IDE plugin system
- Environment: Cursor IDE
- Live dependencies: Cursor plugin runtime

## Completion Class

- Contract complete means: `.cursor-plugin/plugin.json` valid; skills, agents, rules, commands, hooks correctly structured
- Integration complete means: Cursor loads the plugin without errors; at least one skill is available
- Operational complete means: n/a

## Final Integrated Acceptance

- `npm run build` produces `dist/cursor-plugin/` with valid Cursor plugin format
- Cursor loads the plugin and at least one kata skill is available

## Key Risks / Unknowns

- Cursor plugin format differences from Claude Code Plugin — must read https://cursor.com/docs/reference/plugins before planning
- Cursor has `.mdc` rule files (`.cursor-plugin/`); mapping kata workflow docs to Cursor rules requires design

## Implementation Decisions (provisional)

- Docs: https://cursor.com/docs/reference/plugins
- Build output: `dist/cursor-plugin/`
- Build script: `scripts/build-plugin-cursor.js`
