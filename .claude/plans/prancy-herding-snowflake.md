# Consolidate docs skills into `maintaining-docs`

## Context

Two overlapping skills exist: `updating-docs` (CLI-only internal markdown) and `maintaining-monorepo-docs` (docs site MDX pages). Now that a Fumadocs site covers all apps, we need one skill that handles both the universal docs site AND per-app internal documentation.

## Design

One skill: `.agents/skills/maintaining-docs/SKILL.md`

**Universal target (all apps):** The docs site at `apps/online-docs/content/docs/`. The heuristic mapping table maps source paths to MDX pages. This section comes from `maintaining-monorepo-docs`.

**Per-app targets:** Each app has internal docs (README, AGENTS.md, reference files) that also need updating when that app changes. These are app-specific sections within the same skill.

### Per-app internal docs inventory

**CLI** (`apps/cli/`):
- `apps/cli/src/resources/extensions/kata/docs/preferences-reference.md` — preferences field reference
- `apps/cli/src/resources/extensions/kata/templates/preferences.md` — YAML frontmatter template for new projects
- `apps/cli/src/resources/AGENTS.md` — agent context (architecture, extensions, capabilities)
- `apps/cli/README.md` — user-facing overview
- `apps/cli/docs/visual-explainers/` — workflow diagrams

**Desktop** (`apps/electron/`):
- `apps/electron/README.md` — features, installation, user guide
- `apps/electron/AGENTS.md` — architecture, commands, build setup
- `apps/electron/CHANGELOG.md` — version history

**Symphony** (`apps/symphony/`):
- `apps/symphony/AGENTS.md` — Rust port spec, module mapping

**Orchestrator** (`apps/orchestrator/`):
- `apps/orchestrator/README.md` — overview, quick-start
- `apps/orchestrator/AGENTS.md` — developer guide
- `apps/orchestrator/CHANGELOG.md` — version history
- `apps/orchestrator/docs/USER-GUIDE.md` — workflows, commands, configuration
- `apps/orchestrator/docs/context-monitor.md` — context window monitoring

**Context** (`apps/context/`):
- `apps/context/AGENTS.md` — developer guide
- `apps/context/kata-context-prd.md` — PRD

**Packages** (`packages/`):
- `packages/core/README.md`, `packages/core/AGENTS.md`
- `packages/shared/AGENTS.md`

## Files to create
- `.agents/skills/maintaining-docs/SKILL.md`

## Files to delete
- `.agents/skills/maintaining-monorepo-docs/` (entire directory)
- `.agents/skills/updating-docs/` (entire directory)

## Cross-references to update
- `apps/online-docs/README.md` — references `maintaining-monorepo-docs`
- `docs/superpowers/specs/2026-03-19-kat-490-geistdocs-design.md` — references the old skill name
- `docs/superpowers/plans/2026-03-19-kat-490-geistdocs.md` — references the old skill name

## Skill structure outline

```
# Maintaining Docs

## When to Trigger
(union of both skills' triggers + per-app triggers)

## Workflow
1. Analyze diff
2. Map to docs site pages (universal)
3. Map to app-internal docs (per-app)
4. Update both targets
5. Stage changes

## Universal: Docs Site
Heuristic mapping table (source path → MDX page)
Content standards for MDX pages

## App: CLI
5 specific files with update criteria for each

## App: Desktop
3 files with update criteria

## App: Symphony
1 file with update criteria

## App: Orchestrator
5 files with update criteria

## App: Context
2 files with update criteria

## Packages
2-3 files with update criteria
```

## Verification
- `grep -r "maintaining-monorepo-docs\|updating-docs" .agents/ apps/online-docs/ docs/superpowers/` returns no stale references
- New skill visible via `/maintaining-docs`
- Old directories removed
