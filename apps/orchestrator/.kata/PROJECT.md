# Project

## What This Is

kata-orchestrator is a meta-prompting, context engineering, and spec-driven development system for AI coding agents. It ships as an npm package that installs a workflow system — commands, agents, hooks, templates — into any project, turning Claude Code, Codex, Cursor, and other AI coding tools into a structured, orchestrated development partner.

## Core Value

A developer installs one package and immediately gains a complete structured workflow system — planning, executing, verifying, and advancing through milestones — regardless of which AI coding tool they use.

## Current State

Previously named `get-shit-done-cc` by TÂCHES. A working npm package (v1.22.4) with:
- Workflow commands (markdown files in `get-shit-done/workflows/`)
- Agent definitions (in `agents/`)
- Hooks: context-monitor, check-update, statusline (being removed)
- Templates and references
- Tests

## Architecture / Key Patterns

- Pure markdown + shell — no compiled runtime required for the core system
- npm package that installs into a user's project or globally
- Hooks are JS files built with esbuild (`hooks/dist/`)
- Commands are markdown files loaded by Claude Code / Cursor / Codex
- Agents are markdown files in `agents/`

## Capability Contract

See `.kata/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M001: Rebrand — Rename from gsd/get-shit-done to kata/kata-orchestrator; remove statusline hook
- [ ] M002: Claude Code Plugin — Build and ship the Claude Code Plugin distribution format
- [ ] M003: Codex Plugin — Extend multi-version dist to OpenAI Codex
- [ ] M004: Cursor Plugin — Extend multi-version dist to Cursor IDE
- [ ] M005: Agent Skills — Publish kata-orchestrator as an Agent Skills distribution
