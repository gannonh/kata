# M003: Codex — Context

**Gathered:** 2026-03-13
**Status:** Provisional (planning begins after M002 completes)

## Project Description

kata-orchestrator is a structured workflow system for AI coding agents. M003 extends the multi-version build system to produce a Codex-compatible distribution.

## Why This Milestone

OpenAI Codex is the second-priority distribution target. The build system designed in M002 is extended here to produce a Codex distribution alongside the Claude Code Plugin.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Use kata-orchestrator skills and agents within OpenAI Codex
- Run `npm run build` and get both Claude Code Plugin and Codex distributions

### Entry point / environment
- Entry point: Codex CLI / multi-agent environment
- Environment: OpenAI Codex
- Live dependencies: Codex runtime

## Completion Class

- Contract complete means: Codex distribution structure is valid per openai docs; build script produces it
- Integration complete means: Codex can load and execute kata skills/agents from the dist
- Operational complete means: n/a

## Final Integrated Acceptance

- `npm run build` produces `dist/codex/` with valid Codex format
- At least one kata skill runs in Codex

## Key Risks / Unknowns

- Codex multi-agent and skills API shape — must read https://developers.openai.com/codex/multi-agent and /skills before planning
- Codex may not support the exact same skill/agent markdown format as Claude Code

## Implementation Decisions (provisional)

- Docs: https://developers.openai.com/codex/multi-agent and https://developers.openai.com/codex/skills
- Build output: `dist/codex/`
- Build script: `scripts/build-plugin-codex.js`
