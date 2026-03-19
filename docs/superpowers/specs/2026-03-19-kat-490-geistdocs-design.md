# KAT-490: Geistdocs Site + Visual-Explainer Preset + Docs-in-PR Skill

**Date:** 2026-03-19
**Status:** Draft
**Issue:** KAT-490

## Summary

Replace the abandoned Mintlify documentation site with a Fumadocs-based Geistdocs site at `apps/online-docs/`, serving both end-user and developer audiences across all monorepo apps. Add a visual-explainer "geistdocs" theme preset for embedded HTML pages. Create a `maintaining-monorepo-docs` skill that keeps docs current during the PR lifecycle.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Site location | `apps/online-docs/` (in-place replacement) | Reuse existing path rather than creating `apps/docs/` |
| Scaffolding approach | `npm create fumadocs-app` + Geistdocs theming | Proven scaffolder with correct deps; customize for Kata branding |
| React version | Upgrade monorepo to React 19 (M0) | React 19 is stable; no packages still on 18. Required by Next.js 16 / Fumadocs |
| Workspace membership | Remove `!apps/online-docs` exclusion | Site joins the Bun workspace for shared dependency resolution |
| Symphony docs | Own nav section | Listed as second-priority app |
| Desktop + Viewer | Combined nav section | Single "Desktop/Viewer" section |

## Milestone 0: React 19 Upgrade

Upgrade the monorepo from React 18 to React 19. Validate against the Electron desktop app.

### Changes

- Root `package.json`: bump `react`, `react-dom`, `@types/react`, `@types/react-dom` to React 19 latest
- Bump any Radix UI or other packages that need React 19 peer dep alignment
- `bun install` from root
- `turbo run lint typecheck test` — fix any type errors (e.g., `useRef` requiring initial value)
- Build and launch Electron desktop app (`bun run electron:start`) — verify core flows work

### Validation

- All existing tests pass
- Desktop app builds, launches, and core flows work
- No React 18-only API usage remains

## Milestone 1: Geistdocs App Setup at `apps/online-docs/`

### 1.1 Clean the path

- Delete any remnants at `apps/online-docs/` (directory is already gone from disk)
- Remove the `!apps/online-docs` workspace exclusion from root `package.json`

### 1.2 Scaffold with Fumadocs

Run `npm create fumadocs-app` targeting `apps/online-docs/` with Fumadocs MDX as content source.

Generated files:
- `package.json` — `next`, `fumadocs-core`, `fumadocs-mdx`, `fumadocs-ui`
- `source.config.ts` — points to `content/docs/`
- `next.config.ts` — Fumadocs MDX plugin
- `app/layout.tsx` — root layout
- `app/docs/layout.tsx` — `DocsLayout` with `source.pageTree`
- `app/docs/[[...slug]]/page.tsx` — MDX page renderer
- `lib/source.ts` — source loader
- `content/docs/` — MDX content directory

### 1.3 Customize for Kata

- Add Geist Sans + Geist Mono via `next/font/google` in root layout
- Create `geistdocs.tsx` config: Kata logo, title "Kata Docs", primary color, GitHub nav link
- Configure navigation groups via `meta.json` files in content directories, ordered:
  1. Getting Started
  2. CLI
  3. Symphony
  4. Desktop/Viewer
  5. Context
  6. Orchestrator
  7. Architecture
  8. Visual Explainers

### 1.4 Integrate with monorepo

- Update root `package.json` script: `"docs:dev": "cd apps/online-docs && bun run dev --port 3001"` (port 3001 avoids conflict with Electron dev server on 3000)
- `bun install` from root — confirm workspace resolution
- `bun run docs:dev` — confirm site loads at localhost:3001

## Milestone 2: Content Structure + Seed Pages

### 2.1 Content directory layout

```
apps/online-docs/content/docs/
  index.mdx                         # Landing overview
  getting-started/
    installation.mdx
    quickstart.mdx
  cli/
    index.mdx                       # CLI overview
    commands.mdx
    kata-workflow.mdx                # step, auto, discuss
    extensions.mdx
    agents.mdx
    preferences.mdx
  symphony/
    index.mdx
  desktop/
    index.mdx                       # Desktop + Viewer combined
  context/
    index.mdx
  orchestrator/
    index.mdx
  architecture/
    index.mdx                       # Monorepo overview
    packages.mdx                    # core, shared, ui, mermaid
    conventions.mdx
  visual-explainers/
    index.mdx
```

### 2.2 Seed page approach

Each page gets frontmatter (`title`, `description`) + section headings + brief placeholder text. No full content yet. The `maintaining-monorepo-docs` skill (M4) handles organic content growth during PRs.

The landing page gets overview cards linking to each app section.

### 2.3 VisualExplainer MDX component

File: `apps/online-docs/components/visual-explainer-embed.tsx`

A client component (`'use client'`) rendering an `<iframe>` with props:
- `src` — path to static HTML file
- `height` — iframe height
- `title` — accessibility title

Behavior:
- Listens for Fumadocs theme changes (observes `class="dark"` on `<html>`)
- Forwards theme to iframe via `postMessage({ theme: 'dark' | 'light' })`
- Static HTML files served from `apps/online-docs/public/visual-explainers/`

### 2.4 Migrate existing visual-explainer

- Copy `apps/cli/docs/visual-explainers/kata-step-auto-journeys.html` to `apps/online-docs/public/visual-explainers/`
- Create `visual-explainers/index.mdx` that embeds it using the `VisualExplainerEmbed` component as a demo

## Milestone 3: Visual-Explainer Geistdocs Preset

### 3.1 New preset file

File: `~/.claude/skills/visual-explainer/references/presets.md`

Contains the "Geistdocs" preset:

- **Fonts:** Geist Sans + Geist Mono via Google Fonts CDN
- **Light palette:** White surfaces, slate text, blue accent (Fumadocs light defaults)
- **Dark palette:** Near-black surfaces (`#0a0a0a`), light text, blue accent (Fumadocs dark defaults)
- **CSS variables:** Mapped to standard visual-explainer naming (`--bg`, `--surface`, `--border`, `--text`, `--accent`, etc.)
- **Mermaid theming:** `themeVariables` blocks for light and dark modes
- **Background atmosphere:** Clean, minimal. No grid dots or noise patterns.
- **Border radii, card styles, spacing:** Tuned to Fumadocs component defaults

### 3.2 Theme message listener

The preset includes a `<script>` block that:
1. Listens for `postMessage` events from the parent Geistdocs frame
2. Toggles `data-theme="dark"` on `<html>` to switch palettes
3. Falls back to `prefers-color-scheme` if no message received (standalone viewing)

### 3.3 SKILL.md updates

File: `~/.claude/skills/visual-explainer/SKILL.md`

- Add a section under aesthetics pointing to `references/presets.md`
- Document the "geistdocs" preset convention: when generating pages intended for embedding in the docs site, the skill author selects this preset from `references/presets.md`. This is a manual selection by the person invoking the skill, not a CLI flag.
- Add "geistdocs" to the constrained aesthetics list alongside blueprint, editorial, paper/ink, monochrome terminal

## Milestone 4: `maintaining-monorepo-docs` Skill

### 4.1 New skill file

File: `~/.claude/skills/maintaining-monorepo-docs/SKILL.md`

Separate from any CLI-specific doc skill. Scoped to the entire monorepo.

### 4.2 Trigger conditions

- Code changes affect user-facing behavior in any app
- New features, commands, skills, or extensions added
- Configuration schemas or API surfaces change
- Invokable explicitly via `/maintaining-monorepo-docs`

### 4.3 Workflow

1. Analyze the PR diff (`git diff main...HEAD`) to identify changed files and affected apps
2. Map changes to relevant doc pages using the heuristic table
3. Update existing MDX pages or create new ones to reflect changes
4. If a change warrants a visual explainer, note it in the PR but don't auto-generate
5. Stage doc changes as part of the PR commit

### 4.4 Heuristic mapping table

| Source path pattern | Target doc page |
|---|---|
| `apps/cli/src/resources/extensions/` | `cli/extensions.mdx` |
| `apps/cli/src/resources/extensions/kata/` | `cli/kata-workflow.mdx` |
| `apps/symphony/` | `symphony/index.mdx` |
| `apps/electron/`, `apps/viewer/` | `desktop/index.mdx` |
| `apps/context/` | `context/index.mdx` |
| `apps/orchestrator/` | `orchestrator/index.mdx` |
| `packages/` | `architecture/packages.mdx` |
| New preference fields | `cli/preferences.mdx` |
| New commands/skills | Corresponding app section page |

### 4.5 PR lifecycle integration

The existing `pull-requests` skill handles PR creation and review. `maintaining-monorepo-docs` hooks into the review phase: after code passes review, before merge. Operates independently when invoked directly.

## Milestone 5: Cleanup + Polish

### 5.1 Cleanup

- Verify `!apps/online-docs` exclusion removed (done in M1)
- Update root README if it references old Mintlify site
- Verify `docs:dev` script final form

### 5.2 CI integration

- Add `docs:build` script to `apps/online-docs/package.json` (`next build`)
- Add build task for `apps/online-docs` in `turbo.json` so `turbo run build` includes the docs site
- Add an `apps/online-docs` input override in `turbo.json` (current build inputs are `src/**` which won't match `content/**/*.mdx`, `app/**/*.tsx`, `components/**/*.tsx`)
- Docs build failures block CI, catching broken MDX or missing imports

## Verification Checklist

1. `bun install` succeeds from root with `apps/online-docs` in the workspace
2. `bun run docs:dev` starts the site at localhost:3001
3. Navigation shows all 8 sections in correct order (Getting Started, CLI, Symphony, Desktop/Viewer, Context, Orchestrator, Architecture, Visual Explainers)
4. Seed pages render with correct MDX formatting
5. Visual-explainer iframe embeds load and theme-sync works (toggle dark mode, iframe follows)
6. Visual-explainer skill generates HTML matching the site aesthetic when the geistdocs preset is selected
7. `/maintaining-monorepo-docs` triggers on PR changes and maps to correct doc pages
8. `turbo run build` includes the docs site and succeeds
9. Electron desktop app still builds and runs after React 19 upgrade

## Key Files

| Purpose | Path |
|---|---|
| Geistdocs app | `apps/online-docs/` (replaced in-place) |
| Site config | `apps/online-docs/geistdocs.tsx` |
| MDX content | `apps/online-docs/content/docs/**/*.mdx` |
| iframe component | `apps/online-docs/components/visual-explainer-embed.tsx` |
| Static HTML pages | `apps/online-docs/public/visual-explainers/*.html` |
| VE preset file | `~/.claude/skills/visual-explainer/references/presets.md` |
| VE skill update | `~/.claude/skills/visual-explainer/SKILL.md` |
| Monorepo docs skill | `~/.claude/skills/maintaining-monorepo-docs/SKILL.md` |
| Root package.json | `package.json` (workspaces, scripts) |
