---
name: maintaining-docs
description: Keep all documentation current when code changes land. Covers the docs site (apps/online-docs) and per-app internal docs (README, AGENTS.md, reference files, changelogs). Use after making changes to any app or package that affect user-facing behavior, configuration, architecture, or developer workflows. Also use when adding/removing/renaming commands, skills, extensions, or preference fields. Fires on phrases like "update docs", "sync documentation", or proactively when implementation changes land.
---

# Maintaining Docs

When code changes land, two categories of documentation may need updating:

1. **Docs site** (`apps/online-docs/content/docs/`) — public MDX pages covering all apps
2. **App-internal docs** — README, AGENTS.md, reference files, and changelogs within each app

This skill handles both. It fires during PR review (before merge), after implementation changes, or when invoked explicitly.

## Workflow

1. **Analyze the diff.** Run `git diff main...HEAD --name-only` to list changed files. Group by app.
2. **Map to docs site pages.** Use the heuristic mapping table below to identify which MDX pages need updates.
3. **Map to app-internal docs.** Check the per-app sections below for files that describe something you changed.
4. **Read affected files.** Understand current content before editing.
5. **Update or create pages.** Edit existing content to reflect changes. If a change introduces something entirely new, create a new page or section.
6. **Note visual-explainer opportunities.** If a change warrants a visual explainer (new architecture, complex flow), note it in the PR. Do not auto-generate.
7. **Stage doc changes.** Add updated files to the PR commit.

Do not update files speculatively for changes that haven't happened yet. Only update what reflects the actual current state of the code.

---

## Docs Site

Target: `apps/online-docs/content/docs/`

### Heuristic Mapping Table

| Source path pattern | Target doc page |
|---|---|
| `apps/cli/src/resources/extensions/` | `cli/extensions.mdx` |
| `apps/cli/src/resources/extensions/kata/` | `cli/kata-workflow.mdx` |
| `apps/cli/src/commands/` | `cli/commands.mdx` |
| `apps/symphony/` | `symphony/index.mdx` |
| `apps/electron/`, `apps/viewer/` | `desktop/index.mdx` |
| `apps/context/` | `context/index.mdx` |
| `apps/orchestrator/` | `orchestrator/index.mdx` |
| `packages/core/`, `packages/shared/`, `packages/ui/`, `packages/mermaid/` | `architecture/packages.mdx` |
| New preference fields | `cli/preferences.mdx` |
| New commands or skills | Corresponding app section |

If a change doesn't map to an existing page and is significant enough to document, create a new page in the appropriate section directory.

### MDX Content Standards

- Frontmatter: `title` and `description` fields
- Match heading structure of adjacent pages in the same section
- Keep descriptions factual and concise
- Link to related pages using relative paths
- Do not duplicate inline code comments

---

## App: CLI

When modifying code in `apps/cli/src/` that affects user-facing behavior, preferences, extensions, agent context, or CLI capabilities, check these files:

### Preferences Reference
`apps/cli/src/resources/extensions/kata/docs/preferences-reference.md`

Documents every preference field, its type, default, and behavior. Update when adding, removing, or renaming a preference field, changing a field's type or default, or changing how a preference affects runtime behavior.

### Preferences Template
`apps/cli/src/resources/extensions/kata/templates/preferences.md`

YAML frontmatter template copied into new projects on init. Update when adding a new field (add with its default), removing a field, or changing a default value. Keep template and reference in sync: every field in the template should be documented in the reference, and vice versa.

### Agent Context
`apps/cli/src/resources/AGENTS.md`

Tells the agent about CLI architecture, directory structure, extensions, and capabilities. Update when adding or removing extensions, commands, or skills; changing directory structure or file roles; changing how the agent interacts with the system; or adding new agent prompt templates.

### README
`apps/cli/README.md`

User-facing overview of CLI features, setup, and usage. Update when adding or removing user-visible features or commands, changing setup steps or authentication flow, or changing supported providers or integrations.

### Visual Explainers
`apps/cli/docs/visual-explainers/`

Diagrams and walkthroughs of CLI workflows. Update when changing how the agent interacts with the system or user, changing the flow of commands or agent actions, or adding features that affect workflows.

---

## App: Desktop

When modifying `apps/electron/` or `apps/viewer/`:

### README
`apps/electron/README.md`

Features, installation, and user guide. Update when adding or removing user-visible features, changing setup steps, or modifying the UI.

### Agent Context
`apps/electron/AGENTS.md`

Architecture, commands, tech stack, build setup. Update when changing directory structure, build process, adding new IPC channels, or modifying Electron-specific patterns.

### Changelog
`apps/electron/CHANGELOG.md`

Version history. Update when shipping user-facing changes (follows Keep a Changelog format).

---

## App: Symphony

When modifying `apps/symphony/`:

### Agent Context
`apps/symphony/AGENTS.md`

Rust port specification, module mapping table, feature parity rules. Update when adding new modules, changing the module structure, updating the Elixir-to-Rust mapping, or modifying hard rules.

---

## App: Orchestrator

When modifying `apps/orchestrator/`:

### README
`apps/orchestrator/README.md`

Overview, installation, feature description, quick-start. Update when adding features, changing setup steps, or modifying configuration.

### Agent Context
`apps/orchestrator/AGENTS.md`

Developer guide. Update when changing architecture, adding new capabilities, or modifying conventions.

### Changelog
`apps/orchestrator/CHANGELOG.md`

Version history.

### User Guide
`apps/orchestrator/docs/USER-GUIDE.md`

Detailed reference: workflows, commands, configuration, troubleshooting. Update when adding or modifying user-facing commands, changing configuration options, or adding new workflow patterns.

### Context Monitor
`apps/orchestrator/docs/context-monitor.md`

Context window monitoring system: thresholds, warnings. Update when changing monitoring behavior or thresholds.

---

## App: Context

When modifying `apps/context/`:

### Agent Context
`apps/context/AGENTS.md`

Developer guide with git workflow and hard rules. Update when changing development patterns or adding constraints.

### PRD
`apps/context/kata-context-prd.md`

Product requirements. Update when scope, features, or architecture change significantly.

---

## Packages

When modifying `packages/`:

### Core
- `packages/core/README.md` — installation and usage guide. Update when adding or changing exported types.
- `packages/core/AGENTS.md` — design decisions, peer dependencies. Update when changing key decisions or dependencies.

### Shared
- `packages/shared/AGENTS.md` — developer guide. Update when changing module structure or adding new subsystems.
