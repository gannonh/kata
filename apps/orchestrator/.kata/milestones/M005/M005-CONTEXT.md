# M005: Agent Skills — Context

**Gathered:** 2026-03-13
**Status:** Provisional (planning begins after M004 completes)

## Project Description

kata-orchestrator is a structured workflow system for AI coding agents. M005 publishes kata-orchestrator skills in the open Agent Skills specification format (agentskills.io), making them available to any client implementing the spec.

## Why This Milestone

Agent Skills is the cross-platform open standard for distributing AI agent skills. Publishing kata here maximizes reach across all present and future clients implementing the spec.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Install kata-orchestrator skills in any Agent Skills-compatible client
- `npm run build` produces all four distribution formats including Agent Skills

### Entry point / environment
- Entry point: Any Agent Skills-compatible client
- Environment: Any client implementing https://agentskills.io/specification
- Live dependencies: agentskills.io registry (if publishing)

## Completion Class

- Contract complete means: Each kata skill is a valid directory with `SKILL.md` meeting the agentskills.io spec (name, description, valid frontmatter, directory name matches name field)
- Integration complete means: Skills pass agentskills.io validation
- Operational complete means: n/a

## Final Integrated Acceptance

- `npm run build` produces `dist/agent-skills/` with valid Agent Skills format
- Each skill passes agentskills.io spec validation (name format, description length, required fields)

## Key Risks / Unknowns

- agentskills.io name constraints are strict (lowercase, hyphens only, must match directory) — mapping kata skill names requires care
- Spec: https://agentskills.io/specification

## Implementation Decisions (provisional)

- Docs: https://agentskills.io/specification
- Build output: `dist/agent-skills/`
- Build script: `scripts/build-agent-skills.js`
