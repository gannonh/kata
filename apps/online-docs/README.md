# @kata/online-docs

Documentation site for the Kata monorepo. Built with [Fumadocs](https://fumadocs.dev/) (Next.js 16 + MDX).

## Development

```bash
# From repo root
bun run docs:dev          # starts at http://localhost:3001

# From this directory
bun run dev --port 3001
```

## Adding pages

Drop an MDX file in `content/docs/` and it auto-routes:

```
content/docs/cli/commands.mdx  →  /docs/cli/commands
```

Every page needs frontmatter:

```mdx
---
title: Page Title
description: Brief description.
---

# Page Title

Content here.
```

## Navigation ordering

Each section has a `meta.json` that controls page order in the sidebar:

```json
{
  "title": "CLI",
  "pages": ["index", "commands", "kata-workflow", "extensions", "agents", "preferences"]
}
```

The root `content/docs/meta.json` controls section order. Sections use `---Label---` separators.

## Content structure

```
content/docs/
  index.mdx                  # Landing page
  getting-started/            # Installation, quickstart
  cli/                        # CLI commands, workflow, extensions, agents, preferences
  symphony/                   # Rust binary
  desktop/                    # Electron app + session viewer
  context/                    # Codebase analysis tool
  orchestrator/               # Meta-prompting system
  architecture/               # Monorepo structure, packages, conventions
  visual-explainers/          # Embedded interactive HTML pages
```

## Visual explainers

Interactive HTML pages live in `public/visual-explainers/` and are embedded via the `VisualExplainerEmbed` component:

```mdx
import { VisualExplainerEmbed } from '@/components/visual-explainer-embed';

<VisualExplainerEmbed
  src="/visual-explainers/kata-step-auto-journeys.html"
  height={800}
  title="Kata Step and Auto mode journey visualization"
/>
```

The component syncs the Fumadocs dark/light theme to the iframe via `postMessage`.

## Key files

| File | Purpose |
|---|---|
| `geistdocs.tsx` | Site identity (logo, title, nav links) |
| `source.config.ts` | Fumadocs MDX source definition |
| `next.config.ts` | Next.js config with Fumadocs MDX plugin |
| `app/layout.tsx` | Root layout (Geist fonts, RootProvider) |
| `app/docs/layout.tsx` | Docs layout (DocsLayout, nav config) |
| `app/docs/[[...slug]]/page.tsx` | MDX page renderer |
| `lib/source.ts` | Source loader |
| `postcss.config.mjs` | PostCSS with @tailwindcss/postcss |
| `app/global.css` | Tailwind + Fumadocs styles + @source directives |

## Tailwind v4 + Bun monorepo note

Fumadocs v16 ships `@source inline()` directives in its CSS to tell Tailwind which utilities to generate. These directives don't get processed when nested inside `@import` chains in Bun monorepos (symlinked `node_modules`). The workaround: `global.css` includes all 1500+ `@source inline()` directives extracted from fumadocs-ui's generated CSS. This is ugly but functional. Track [fumadocs#1338](https://github.com/fuma-nama/fumadocs/discussions/1338) for upstream fixes.

## Build

```bash
bun run build    # next build (included in turbo run build)
```

The `@kata/online-docs#build` task in `turbo.json` has custom inputs for MDX content, components, and config files.
