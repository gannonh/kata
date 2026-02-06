---
phase: 34
plan: 01
subsystem: documentation
tags: [cleanup, terminology, architecture]
requires: []
provides: [accurate-architecture-docs]
affects: [CLAUDE.md, KATA-STYLE.md, README.md, scripts/build.js]
tech: []
files_modified:
  - CLAUDE.md
  - KATA-STYLE.md
  - README.md
  - scripts/build.js
decisions: []
duration: 3 min
completed: 2026-02-06
---

# Phase 34 Plan 01: Documentation Terminology Cleanup Summary

Updated CLAUDE.md, KATA-STYLE.md, README.md, and build.js to reflect that agent instructions live as skill resources in `skills/kata-*/references/`, not in a separate `agents/` directory.

## Changes

**CLAUDE.md:**
- Replaced "Agents" architecture bullet with "Skill Resources" describing the `references/` pattern
- Replaced Multi-Agent Orchestration table (listing specific agent names) with prose describing general-purpose subagent spawning
- Removed "Sub-agents Spawned" column from Available Skills table
- Updated "Skills ARE orchestrators" line to mention inlined instructions

**KATA-STYLE.md:**
- Updated orchestrator description to mention inlined instructions from `references/`
- Updated Fresh Context Pattern to describe general-purpose subagents with inlined instructions
- Removed `agent-history.json` from State Preservation list

**README.md:**
- Changed orchestration table column header from "Agents" to "Subagents"

**scripts/build.js:**
- Simplified `transformPluginPaths` JSDoc to remove agent-specific explanation

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 197b551 | CLAUDE.md architecture and skills table updates |
| 2 | dc58485 | KATA-STYLE.md, README.md, build.js terminology |

## Deviations

None.
