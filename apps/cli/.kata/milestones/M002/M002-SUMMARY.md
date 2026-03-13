---
id: M002
provides:
  - Native Linear GraphQL client extension with 22 CRUD tools
  - Per-project workflow/Linear configuration with centralized mode resolution and live validation
  - `/kata prefs status` as a canonical redacted inspection surface for workflow mode and Linear config health
key_files:
  - src/resources/extensions/linear/linear-client.ts
  - src/resources/extensions/linear/linear-tools.ts
  - src/resources/extensions/linear/index.ts
  - src/resources/extensions/kata/preferences.ts
  - src/resources/extensions/kata/linear-config.ts
  - src/resources/extensions/kata/commands.ts
  - src/loader.ts
completed_at: null
---

# M002: Linear Mode

**In progress — S01 and S02 complete, S03-S06 remaining**

## Slices Completed

- S01: Linear GraphQL Client Extension — Native Linear client with 22 tools, all operations verified against real API (30/30 integration tests). Risks retired: API coverage, DocumentCreateInput.issueId [Internal].
- S02: Project Configuration & Mode Switching — Canonical `.kata/preferences.md` + legacy fallback, centralized `linear-config.ts`, live team/project validation, `/kata prefs status`, and guarded entrypoints that stop Linear projects from silently falling back to file mode.

## Slices Remaining

- S03: Entity Mapping — Hierarchy & Labels
- S04: Document Storage — Artifacts as Linear Documents
- S05: State Derivation from Linear API
- S06: Workflow Prompt & Auto-Mode Integration
