# Requirements

## Active

### R001 — Package identity is kata-orchestrator
- Class: core-capability
- Status: validated
- Description: All references to `get-shit-done`, `gsd`, and TÂCHES branding must be replaced with `kata-orchestrator` and `kata` throughout the codebase, docs, and package metadata.
- Why it matters: The product is being renamed; inconsistent branding creates confusion for users and in the npm registry.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: npm test 535/535 green; npm pack tarball clean of gsd/get-shit-done references (M001/S01)
- Notes: Includes package.json name, bin entry, internal file names, agent names, command names, hook names, README, CHANGELOG

### R002 — Statusline hook removed
- Class: anti-feature
- Status: validated
- Description: The `gsd-statusline.js` hook and all references to it must be removed from the project.
- Why it matters: User explicitly does not want this feature in the rebranded product.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: ls hooks/ | grep gsd returns empty; npm pack --dry-run contains no statusline references (M001/S01)
- Notes: Remove file, remove from build scripts, remove from docs

### R003 — Claude Code Plugin distribution format
- Class: primary-user-loop
- Status: active
- Description: kata-orchestrator ships as a valid Claude Code Plugin — with `.claude-plugin/plugin.json`, `skills/`, `agents/`, `commands/`, and `hooks/` at the plugin root.
- Why it matters: Claude Code Plugin is the highest-priority distribution target; enables users to install kata via `claude plugin install`.
- Source: user
- Primary owning slice: M002/S01
- Supporting slices: M002/S02
- Validation: unmapped
- Notes: Plugin must pass Claude Code plugin validation, skills must be namespaced under `kata-orchestrator:`

### R004 — Codex distribution format
- Class: primary-user-loop
- Status: active
- Description: kata-orchestrator ships a Codex-compatible distribution with the appropriate structure for OpenAI Codex multi-agent and skills.
- Why it matters: Codex is second-priority distribution target.
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: none
- Validation: unmapped
- Notes: See https://developers.openai.com/codex/multi-agent and /skills

### R005 — Cursor Plugin distribution format
- Class: primary-user-loop
- Status: active
- Description: kata-orchestrator ships as a valid Cursor Plugin — with `.cursor-plugin/plugin.json`, `skills/`, `agents/`, `commands/`, `rules/`, and `hooks/` at the plugin root.
- Why it matters: Cursor is third-priority distribution target.
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: none
- Validation: unmapped
- Notes: Plugin must pass Cursor plugin validation

### R006 — Agent Skills distribution format
- Class: primary-user-loop
- Status: active
- Description: kata-orchestrator skills are published in the agentskills.io specification format — each skill as a directory with a valid `SKILL.md` (name, description, optional scripts/references/assets).
- Why it matters: Agent Skills is the cross-platform open standard; enables distribution to any client implementing the spec.
- Source: user
- Primary owning slice: M005/S01
- Supporting slices: none
- Validation: unmapped
- Notes: See https://agentskills.io/specification

### R007 — Multi-version build system
- Class: operability
- Status: active
- Description: A single build process produces all distribution formats from a shared source of truth — one command generates Claude Code Plugin, Codex, Cursor, and Agent Skills distributions.
- Why it matters: Maintaining N separate copies of skills/agents/commands is unsustainable; a build system ensures consistency.
- Source: inferred
- Primary owning slice: M002/S01
- Supporting slices: M003/S01, M004/S01, M005/S01
- Validation: unmapped
- Notes: Build system designed in M002, extended in M003-M005

## Out of Scope

### R010 — Statusline / terminal UI embellishments
- Class: anti-feature
- Status: out-of-scope
- Description: No statusline hook or terminal status bar feature.
- Why it matters: Prevents re-introduction of removed feature.
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Explicitly removed in M001

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | validated | M001/S01 | none | npm test + tarball grep (M001/S01) |
| R002 | anti-feature | validated | M001/S01 | none | ls hooks/ + tarball grep (M001/S01) |
| R003 | primary-user-loop | active | M002/S01 | M002/S02 | unmapped |
| R004 | primary-user-loop | active | M003/S01 | none | unmapped |
| R005 | primary-user-loop | active | M004/S01 | none | unmapped |
| R006 | primary-user-loop | active | M005/S01 | none | unmapped |
| R007 | operability | active | M002/S01 | M003/S01, M004/S01, M005/S01 | unmapped |
| R010 | anti-feature | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 5
- Validated: 2 (R001, R002)
- Mapped to slices: 7
