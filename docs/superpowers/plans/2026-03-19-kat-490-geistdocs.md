# KAT-490: Geistdocs Site + Visual-Explainer Preset + Docs-in-PR Skill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the abandoned Mintlify docs with a Fumadocs-based site at `apps/online-docs/`, add a visual-explainer geistdocs theme preset, and create a skill to keep docs current during PRs.

**Architecture:** Fumadocs MDX scaffolded via `npm create fumadocs-app`, customized with Geist fonts and Kata branding. Visual-explainer pages embed via iframe with postMessage theme sync. A new Claude skill maps PR diffs to doc pages.

**Tech Stack:** Next.js 16, Fumadocs (core + mdx + ui), React 19, Geist fonts, MDX, Turborepo

**Spec:** `docs/superpowers/specs/2026-03-19-kat-490-geistdocs-design.md`

---

## File Map

### Created

| File | Responsibility |
|---|---|
| `apps/online-docs/package.json` | Fumadocs app deps (next, fumadocs-core, fumadocs-mdx, fumadocs-ui) |
| `apps/online-docs/next.config.ts` | Fumadocs MDX plugin config |
| `apps/online-docs/source.config.ts` | MDX source definition pointing to `content/docs/` |
| `apps/online-docs/app/layout.tsx` | Root layout with Geist fonts |
| `apps/online-docs/app/docs/layout.tsx` | DocsLayout with source.pageTree + nav config |
| `apps/online-docs/app/docs/[[...slug]]/page.tsx` | MDX page renderer |
| `apps/online-docs/lib/source.ts` | Source loader |
| `apps/online-docs/geistdocs.tsx` | Site identity config (logo, title, nav links) |
| `apps/online-docs/tsconfig.json` | TypeScript config |
| `apps/online-docs/content/docs/**/*.mdx` | 17 seed MDX pages (see Task 5) |
| `apps/online-docs/content/docs/**/meta.json` | Navigation ordering per section |
| `apps/online-docs/components/visual-explainer-embed.tsx` | Client component: iframe + postMessage theme sync |
| `apps/online-docs/public/visual-explainers/kata-step-auto-journeys.html` | Copied from `apps/cli/docs/visual-explainers/` |
| `~/.claude/skills/visual-explainer/references/presets.md` | Geistdocs preset (fonts, palettes, CSS vars, Mermaid themes) |
| `~/.claude/skills/maintaining-monorepo-docs/SKILL.md` | Docs-in-PR skill |

### Modified

| File | Change |
|---|---|
| `package.json` (root) | React 19 bump, remove `!apps/online-docs` exclusion, update `docs:dev` script |
| `turbo.json` | Add `apps/online-docs` build input override |
| `README.md` | Update online-docs references |
| `~/.claude/skills/visual-explainer/SKILL.md` | Add geistdocs to constrained aesthetics, point to presets.md |

---

## Task 1: Upgrade React 18 → 19

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Bump React deps in root package.json**

Change these in the `dependencies` section:
```json
"react": "^19.1.0",
"react-dom": "^19.1.0",
```

Change these in the `devDependencies` section:
```json
"@types/react": "^19.1.0",
"@types/react-dom": "^19.1.0",
```

- [ ] **Step 2: Install and validate**

Run: `cd /Volumes/EVO/kata/kata-mono && bun install`
Expected: Clean install, no peer dep errors. Radix UI packages (`@radix-ui/react-avatar@^1.1.11`, etc.) support React 19.

- [ ] **Step 3: Run lint + typecheck + test**

Run: `turbo run lint typecheck test`
Expected: All pass. If `useRef()` calls without initial values cause type errors, fix them by adding `null` as the initial value.

- [ ] **Step 4: Build and launch desktop app**

Run: `bun run electron:build`
Expected: Build succeeds.

Run: `bun run electron:start`
Expected: Desktop app launches, main window renders. Manually verify the chat interface loads.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "feat(M0): upgrade React 18 → 19 across monorepo"
```

---

## Task 2: Clean workspace and scaffold Fumadocs

**Files:**
- Modify: `package.json` (root)
- Create: `apps/online-docs/` (entire scaffold)

- [ ] **Step 1: Remove workspace exclusion**

In root `package.json`, change the `workspaces` array from:
```json
"workspaces": [
  "packages/*",
  "apps/*",
  "!apps/online-docs"
],
```
to:
```json
"workspaces": [
  "packages/*",
  "apps/*"
],
```

- [ ] **Step 2: Update docs:dev script**

In root `package.json`, change:
```json
"docs:dev": "cd apps/online-docs && npm install && npx mintlify dev",
```
to:
```json
"docs:dev": "cd apps/online-docs && bun run dev --port 3001",
```

- [ ] **Step 3: Scaffold Fumadocs app**

Run from the repo root:
```bash
cd /Volumes/EVO/kata/kata-mono && npx create-fumadocs-app apps/online-docs
```

When prompted, select:
- Content source: **Fumadocs MDX**

If the interactive scaffolder fails in a non-interactive shell, fall back to manual scaffold:
1. Create `apps/online-docs/package.json` with deps: `next`, `fumadocs-core`, `fumadocs-mdx`, `fumadocs-ui`, `react`, `react-dom`
2. Create `apps/online-docs/source.config.ts`, `next.config.ts`, `tsconfig.json`
3. Create `apps/online-docs/app/layout.tsx`, `app/docs/layout.tsx`, `app/docs/[[...slug]]/page.tsx`
4. Create `apps/online-docs/lib/source.ts`
5. Create `apps/online-docs/content/docs/index.mdx` (placeholder)

Refer to Fumadocs docs (Context7: `/llmstxt/fumadocs_dev_llms-full_txt`) for exact file contents.

- [ ] **Step 4: Install from root**

Run: `cd /Volumes/EVO/kata/kata-mono && bun install`
Expected: Workspace resolves `apps/online-docs` correctly. No errors.

- [ ] **Step 5: Verify scaffold works**

Run: `bun run docs:dev`
Expected: Next.js dev server starts at `http://localhost:3001`. Default Fumadocs page renders.

- [ ] **Step 6: Commit**

```bash
git add package.json apps/online-docs/
git commit -m "feat(M1): scaffold Fumadocs app at apps/online-docs"
```

---

## Task 3: Customize site identity and fonts

**Files:**
- Modify: `apps/online-docs/app/layout.tsx`
- Create: `apps/online-docs/geistdocs.tsx`
- Modify: `apps/online-docs/app/docs/layout.tsx`

- [ ] **Step 1: Add Geist fonts to root layout**

In `apps/online-docs/app/layout.tsx`, add Geist font imports and apply to `<html>`:

```tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

// In the layout JSX:
<html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
```

Add `geist` to `apps/online-docs/package.json` dependencies if not already present:
```bash
cd apps/online-docs && bun add geist
```

- [ ] **Step 2: Create geistdocs.tsx config**

Create `apps/online-docs/geistdocs.tsx`:

```tsx
import type { ReactNode } from 'react';

export const siteConfig = {
  title: 'Kata Docs',
  description: 'Documentation for the Kata monorepo',
  nav: {
    links: [
      { label: 'GitHub', href: 'https://github.com/gannonh/kata-mono', external: true },
    ],
  },
};

export function Logo(): ReactNode {
  return <span style={{ fontWeight: 700 }}>Kata</span>;
}
```

- [ ] **Step 3: Wire config into docs layout**

In `apps/online-docs/app/docs/layout.tsx`, import from `geistdocs.tsx` and pass to `DocsLayout`:

```tsx
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { siteConfig, Logo } from '@/geistdocs';
import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: <Logo />,
        ...siteConfig.nav,
      }}
    >
      {children}
    </DocsLayout>
  );
}
```

- [ ] **Step 4: Verify**

Run: `bun run docs:dev`
Expected: Site loads at localhost:3001 with Geist fonts and "Kata" logo in nav.

- [ ] **Step 5: Commit**

```bash
git add apps/online-docs/
git commit -m "feat(M1): add Kata branding, Geist fonts, geistdocs config"
```

---

## Task 4: Configure navigation structure

**Files:**
- Create: `apps/online-docs/content/docs/meta.json` (root)
- Create: `apps/online-docs/content/docs/getting-started/meta.json`
- Create: `apps/online-docs/content/docs/cli/meta.json`
- Create: `apps/online-docs/content/docs/symphony/meta.json`
- Create: `apps/online-docs/content/docs/desktop/meta.json`
- Create: `apps/online-docs/content/docs/context/meta.json`
- Create: `apps/online-docs/content/docs/orchestrator/meta.json`
- Create: `apps/online-docs/content/docs/architecture/meta.json`
- Create: `apps/online-docs/content/docs/visual-explainers/meta.json`

- [ ] **Step 1: Create root meta.json**

Create `apps/online-docs/content/docs/meta.json`:

```json
{
  "title": "Kata Docs",
  "pages": [
    "---Getting Started---",
    "getting-started",
    "---CLI---",
    "cli",
    "---Symphony---",
    "symphony",
    "---Desktop/Viewer---",
    "desktop",
    "---Context---",
    "context",
    "---Orchestrator---",
    "orchestrator",
    "---Architecture---",
    "architecture",
    "---Visual Explainers---",
    "visual-explainers"
  ]
}
```

Note: Consult Fumadocs docs for the exact `meta.json` schema. The `---Title---` syntax creates section separators. If Fumadocs uses a different format, adapt accordingly.

- [ ] **Step 2: Create per-section meta.json files**

For each section with multiple pages, create a `meta.json` that orders the pages. Example for `cli/`:

```json
{
  "title": "CLI",
  "pages": ["index", "commands", "kata-workflow", "extensions", "agents", "preferences"]
}
```

Create similar files for `getting-started/` (`["installation", "quickstart"]`) and `architecture/` (`["index", "packages", "conventions"]`). Single-page sections (symphony, desktop, context, orchestrator, visual-explainers) need only a basic meta.json with their title.

- [ ] **Step 3: Verify navigation**

Run: `bun run docs:dev`
Expected: Sidebar shows all 8 sections in the correct order. Each section expands to show its sub-pages.

- [ ] **Step 4: Commit**

```bash
git add apps/online-docs/content/
git commit -m "feat(M1): configure navigation structure with meta.json files"
```

---

## Task 5: Write seed MDX pages

**Files:**
- Create: 17 MDX files under `apps/online-docs/content/docs/`

- [ ] **Step 1: Create landing page**

Create `apps/online-docs/content/docs/index.mdx`:

```mdx
---
title: Kata Docs
description: Documentation for the Kata monorepo — CLI, Symphony, Desktop, Context, and Orchestrator.
---

# Kata

Kata is a monorepo containing five apps and four shared packages for building AI-powered development tools.

## Apps

- **[CLI](/docs/cli)** — Published NPM CLI agent
- **[Symphony](/docs/symphony)** — Rust binary for agent orchestration
- **[Desktop/Viewer](/docs/desktop)** — Electron desktop app and session viewer
- **[Context](/docs/context)** — Codebase analysis and context indexing
- **[Orchestrator](/docs/orchestrator)** — Meta-prompting system

## Architecture

- **[Monorepo Overview](/docs/architecture)** — Structure, packages, and conventions
```

- [ ] **Step 2: Create Getting Started pages**

Create `apps/online-docs/content/docs/getting-started/installation.mdx`:

```mdx
---
title: Installation
description: How to install and set up Kata.
---

# Installation

## Prerequisites

## Install

## Verify
```

Create `apps/online-docs/content/docs/getting-started/quickstart.mdx`:

```mdx
---
title: Quickstart
description: Get up and running with Kata in minutes.
---

# Quickstart

## Your First Session

## Next Steps
```

- [ ] **Step 3: Create CLI section pages**

Create these 6 files under `apps/online-docs/content/docs/cli/`:

`index.mdx`:
```mdx
---
title: CLI
description: The Kata CLI agent — commands, workflows, extensions, and agents.
---

# CLI

The Kata CLI (`@kata-sh/cli`) is the primary interface for interacting with Kata agents.

## Key Features

## Getting Started
```

`commands.mdx`:
```mdx
---
title: Commands
description: CLI command reference.
---

# Commands

## Core Commands

## Options
```

`kata-workflow.mdx`:
```mdx
---
title: Kata Workflow
description: Step, auto, and discuss modes.
---

# Kata Workflow

## Step Mode

## Auto Mode

## Discuss Mode
```

`extensions.mdx`:
```mdx
---
title: Extensions
description: CLI extension system.
---

# Extensions

## Built-in Extensions

## Creating Extensions
```

`agents.mdx`:
```mdx
---
title: Agents
description: Agent configuration and usage.
---

# Agents

## Available Agents

## Agent Configuration
```

`preferences.mdx`:
```mdx
---
title: Preferences
description: CLI configuration and preferences.
---

# Preferences

## Configuration File

## Available Settings
```

- [ ] **Step 4: Create remaining app index pages**

Create one `index.mdx` per app section:

`symphony/index.mdx`:
```mdx
---
title: Symphony
description: Rust binary for agent orchestration.
---

# Symphony

## Overview

## Architecture

## Usage
```

`desktop/index.mdx`:
```mdx
---
title: Desktop & Viewer
description: Electron desktop app and session transcript viewer.
---

# Desktop & Viewer

## Desktop App

## Session Viewer

## Development
```

`context/index.mdx`:
```mdx
---
title: Context
description: Codebase analysis and context indexing tool.
---

# Context

## Overview

## How It Works

## Usage
```

`orchestrator/index.mdx`:
```mdx
---
title: Orchestrator
description: Meta-prompting system for agent orchestration.
---

# Orchestrator

## Overview

## Architecture

## Usage
```

- [ ] **Step 5: Create architecture section pages**

Create 3 files under `apps/online-docs/content/docs/architecture/`:

`index.mdx`:
```mdx
---
title: Architecture
description: Monorepo structure and design decisions.
---

# Architecture

## Monorepo Layout

## Apps

## Packages

## Build System
```

`packages.mdx`:
```mdx
---
title: Packages
description: Shared packages — core, shared, ui, mermaid.
---

# Packages

## @craft-agent/core

## @craft-agent/shared

## @craft-agent/ui

## @craft-agent/mermaid
```

`conventions.mdx`:
```mdx
---
title: Conventions
description: Coding conventions and patterns used across the monorepo.
---

# Conventions

## TypeScript

## Testing

## Git Workflow
```

- [ ] **Step 6: Create visual-explainers index page**

Create `apps/online-docs/content/docs/visual-explainers/index.mdx` (placeholder — the embed will be added in Task 7):

```mdx
---
title: Visual Explainers
description: Interactive visual explanations of Kata systems and workflows.
---

# Visual Explainers

Interactive HTML pages that explain Kata architecture and workflows visually.
```

- [ ] **Step 7: Verify all pages render**

Run: `bun run docs:dev`
Expected: All 17 pages render with correct titles. Navigation shows full structure.

- [ ] **Step 8: Commit**

```bash
git add apps/online-docs/content/
git commit -m "feat(M2): add 17 seed MDX pages across all sections"
```

---

## Task 6: Create VisualExplainerEmbed component

**Files:**
- Create: `apps/online-docs/components/visual-explainer-embed.tsx`

- [ ] **Step 1: Write the component**

Create `apps/online-docs/components/visual-explainer-embed.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';

interface VisualExplainerEmbedProps {
  src: string;
  height?: number;
  title: string;
}

export function VisualExplainerEmbed({
  src,
  height = 600,
  title,
}: VisualExplainerEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const html = document.documentElement;

    function sendTheme() {
      const isDark = html.classList.contains('dark');
      iframeRef.current?.contentWindow?.postMessage(
        { theme: isDark ? 'dark' : 'light' },
        '*',
      );
    }

    // Send initial theme once iframe loads
    const iframe = iframeRef.current;
    if (iframe) {
      iframe.addEventListener('load', sendTheme);
    }

    // Observe class changes on <html> for theme toggles
    const observer = new MutationObserver(sendTheme);
    observer.observe(html, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      iframe?.removeEventListener('load', sendTheme);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      width="100%"
      height={height}
      style={{ border: 'none', borderRadius: '8px' }}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run docs:dev`
Expected: No compilation errors. Component not yet used in any page.

- [ ] **Step 3: Commit**

```bash
git add apps/online-docs/components/visual-explainer-embed.tsx
git commit -m "feat(M2): add VisualExplainerEmbed client component with theme sync"
```

---

## Task 7: Migrate visual-explainer HTML and embed it

**Files:**
- Create: `apps/online-docs/public/visual-explainers/kata-step-auto-journeys.html`
- Modify: `apps/online-docs/content/docs/visual-explainers/index.mdx`

- [ ] **Step 1: Copy the HTML file**

```bash
mkdir -p /Volumes/EVO/kata/kata-mono/apps/online-docs/public/visual-explainers
cp /Volumes/EVO/kata/kata-mono/apps/cli/docs/visual-explainers/kata-step-auto-journeys.html \
   /Volumes/EVO/kata/kata-mono/apps/online-docs/public/visual-explainers/
```

- [ ] **Step 2: Update the visual-explainers index page to embed it**

Replace the contents of `apps/online-docs/content/docs/visual-explainers/index.mdx`:

```mdx
---
title: Visual Explainers
description: Interactive visual explanations of Kata systems and workflows.
---

import { VisualExplainerEmbed } from '@/components/visual-explainer-embed';

# Visual Explainers

Interactive HTML pages that explain Kata architecture and workflows visually.

## Kata Step & Auto Journeys

<VisualExplainerEmbed
  src="/visual-explainers/kata-step-auto-journeys.html"
  height={800}
  title="Kata Step and Auto mode journey visualization"
/>
```

- [ ] **Step 3: Verify embed renders**

Run: `bun run docs:dev`
Navigate to: `http://localhost:3001/docs/visual-explainers`
Expected: The iframe loads and displays the kata-step-auto-journeys page. Toggle dark mode in the docs site — the iframe should follow (it will only respond if the HTML has a postMessage listener; the existing file uses `prefers-color-scheme` so it may not sync yet — that's OK, the preset in M3 adds the listener).

- [ ] **Step 4: Commit**

```bash
git add apps/online-docs/public/visual-explainers/ apps/online-docs/content/docs/visual-explainers/
git commit -m "feat(M2): embed kata-step-auto-journeys visual explainer"
```

---

## Task 8: Create visual-explainer geistdocs preset

**Files:**
- Create: `~/.claude/skills/visual-explainer/references/presets.md`

- [ ] **Step 1: Write the preset file**

Create `/Users/gannonhall/.claude/skills/visual-explainer/references/presets.md`:

```markdown
# Visual Explainer Presets

Named presets for generating visual-explainer pages that match specific host environments.

## Geistdocs

For pages intended to be embedded in the Fumadocs-based Kata documentation site at `apps/online-docs/`.

### Fonts

Load via Google Fonts CDN:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

```css
--font-sans: 'Geist', system-ui, -apple-system, sans-serif;
--font-mono: 'Geist Mono', ui-monospace, monospace;
```

### Light Palette (default)

```css
:root {
  --bg: #ffffff;
  --surface: #f8f9fa;
  --surface-2: #f1f3f5;
  --border: #e2e8f0;
  --text: #1a202c;
  --text-muted: #64748b;
  --accent: #2563eb;
  --accent-muted: #3b82f6;
  --code-bg: #f1f5f9;
}
```

### Dark Palette

```css
[data-theme="dark"] {
  --bg: #0a0a0a;
  --surface: #111111;
  --surface-2: #1a1a1a;
  --border: #2a2a2a;
  --text: #ededed;
  --text-muted: #a1a1a1;
  --accent: #3b82f6;
  --accent-muted: #60a5fa;
  --code-bg: #1e1e1e;
}
```

### Mermaid Theme Variables

Light:
```javascript
themeVariables: {
  primaryColor: '#dbeafe',
  primaryTextColor: '#1a202c',
  primaryBorderColor: '#2563eb',
  lineColor: '#64748b',
  secondaryColor: '#f1f5f9',
  tertiaryColor: '#f8f9fa',
  fontFamily: 'Geist, system-ui, sans-serif',
}
```

Dark:
```javascript
themeVariables: {
  primaryColor: '#1e3a5f',
  primaryTextColor: '#ededed',
  primaryBorderColor: '#3b82f6',
  lineColor: '#a1a1a1',
  secondaryColor: '#1a1a1a',
  tertiaryColor: '#111111',
  fontFamily: 'Geist, system-ui, sans-serif',
}
```

### Background Atmosphere

Clean and minimal. No grid dots, no noise patterns, no gradients. Solid `var(--bg)` background. This matches the Fumadocs clean aesthetic.

### Component Styles

```css
/* Cards */
border-radius: 8px;
border: 1px solid var(--border);
background: var(--surface);
padding: 1.25rem;

/* Code blocks */
border-radius: 6px;
background: var(--code-bg);
font-family: var(--font-mono);
font-size: 0.875rem;

/* Section spacing */
gap: 1.5rem; /* between cards */
padding: 2rem; /* page margins */
```

### PostMessage Theme Listener

Include this script in every geistdocs-preset page. It allows the parent Fumadocs iframe host to toggle themes dynamically:

```html
<script>
  // Listen for theme messages from parent Geistdocs frame
  window.addEventListener('message', (event) => {
    if (event.data && event.data.theme) {
      document.documentElement.setAttribute('data-theme', event.data.theme);
    }
  });

  // Fallback: use prefers-color-scheme if no parent message
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!document.documentElement.hasAttribute('data-theme-locked')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
</script>
```
```

- [ ] **Step 2: Commit**

```bash
cd /Users/gannonhall/.claude/skills/visual-explainer
git add references/presets.md
git commit -m "feat(M3): add geistdocs preset for visual-explainer skill"
```

Note: If the skills directory is not a git repo, just note the file was created. It lives outside the monorepo.

---

## Task 9: Update visual-explainer SKILL.md

**Files:**
- Modify: `/Users/gannonhall/.claude/skills/visual-explainer/SKILL.md`

- [ ] **Step 1: Add geistdocs to constrained aesthetics**

In `~/.claude/skills/visual-explainer/SKILL.md`, find the constrained aesthetics list (around line 35-39). After the "Monochrome terminal" line, add:

```
- Geistdocs (Geist Sans + Geist Mono, white/near-black surfaces, blue accent, clean minimal background — for pages embedded in Kata docs site) — see `./references/presets.md` for full spec
```

So the section reads:
```
**Constrained aesthetics (prefer these):**
- Blueprint (technical drawing feel, subtle grid background, deep slate/blue palette, monospace labels, precise borders) — see `websocket-implementation-plan.html` for reference
- Editorial (serif headlines like Instrument Serif or Crimson Pro, generous whitespace, muted earth tones or deep navy + gold)
- Paper/ink (warm cream `#faf7f5` background, terracotta/sage accents, informal feel)
- Monochrome terminal (green/amber on near-black, monospace everything, CRT glow optional)
- Geistdocs (Geist Sans + Geist Mono, white/near-black surfaces, blue accent, clean minimal background — for pages embedded in Kata docs site) — see `./references/presets.md` for full spec
```

- [ ] **Step 2: Add presets reference section**

After the "swap test" paragraph (around line 50), add a new subsection:

```markdown
### Presets

For pages targeting a specific host environment, use a named preset from `./references/presets.md`. Presets define fonts, palettes, Mermaid theme variables, component styles, and a postMessage theme listener for iframe embedding. Currently available: **Geistdocs** (for embedding in the Kata documentation site).

When generating a page for embedding, select the matching preset manually. This is not a CLI flag — it is a design choice made when invoking the skill.
```

- [ ] **Step 3: Commit**

Note: This file lives outside the monorepo at `~/.claude/skills/visual-explainer/SKILL.md`. If it's not in a git repo, just note the edit was made.

---

## Task 10: Create maintaining-monorepo-docs skill

**Files:**
- Create: `/Users/gannonhall/.claude/skills/maintaining-monorepo-docs/SKILL.md`

- [ ] **Step 1: Create the skill directory and SKILL.md**

Create `/Users/gannonhall/.claude/skills/maintaining-monorepo-docs/SKILL.md`:

```markdown
---
name: maintaining-monorepo-docs
description: Keep monorepo documentation current during the PR lifecycle. Analyzes diffs, maps code changes to doc pages, and updates or creates MDX content before merge. Invoke explicitly or during PR review.
---

# Maintaining Monorepo Docs

Update documentation in `apps/online-docs/content/docs/` to reflect code changes during the PR lifecycle. This skill fires during PR review (before merge) or when invoked explicitly.

## When to Trigger

- Code changes affect user-facing behavior in any app
- New features, commands, skills, or extensions are added
- Configuration schemas or API surfaces change
- New preference fields are introduced
- Explicitly via `/maintaining-monorepo-docs`

## Workflow

1. **Analyze the diff.** Run `git diff main...HEAD --name-only` to list changed files. Group by app.

2. **Map to doc pages.** Use the table below to identify which doc pages need updates.

3. **Read the affected doc pages.** Understand current content before editing.

4. **Update or create pages.** Edit existing MDX pages to reflect changes. If a change introduces something entirely new (a new command, a new extension), create a new MDX page in the appropriate section.

5. **Note visual-explainer opportunities.** If a change warrants a visual explainer (new architecture, complex flow), add a comment in the PR noting it. Do not auto-generate visual explainers.

6. **Stage doc changes.** Add updated/created MDX files to the PR commit.

## Heuristic Mapping Table

| Source path pattern | Target doc page |
|---|---|
| `apps/cli/src/resources/extensions/` | `content/docs/cli/extensions.mdx` |
| `apps/cli/src/resources/extensions/kata/` | `content/docs/cli/kata-workflow.mdx` |
| `apps/cli/src/commands/` | `content/docs/cli/commands.mdx` |
| `apps/symphony/` | `content/docs/symphony/index.mdx` |
| `apps/electron/`, `apps/viewer/` | `content/docs/desktop/index.mdx` |
| `apps/context/` | `content/docs/context/index.mdx` |
| `apps/orchestrator/` | `content/docs/orchestrator/index.mdx` |
| `packages/core/` | `content/docs/architecture/packages.mdx` |
| `packages/shared/` | `content/docs/architecture/packages.mdx` |
| `packages/ui/` | `content/docs/architecture/packages.mdx` |
| `packages/mermaid/` | `content/docs/architecture/packages.mdx` |
| New preference fields | `content/docs/cli/preferences.mdx` |
| New skills | Corresponding app section or `content/docs/cli/agents.mdx` |

If a change doesn't map to an existing page and is significant enough to document, create a new page in the appropriate section directory.

## Content Standards

- Use the same frontmatter format as existing pages: `title` and `description` fields
- Match the heading structure of adjacent pages in the same section
- Keep descriptions factual and concise
- Link to related pages within the docs using relative paths
- Do not add content that duplicates inline code comments

## Integration with PR Lifecycle

This skill coordinates with the `pull-requests` skill. It runs during the review phase: after code passes review, before merge. It can also be invoked independently at any time.
```

- [ ] **Step 2: Commit**

Note: This file lives outside the monorepo at `~/.claude/skills/`. If it's not in a git repo, just note the file was created.

---

## Task 11: CI integration — turbo.json + build script

**Files:**
- Modify: `turbo.json`
- Modify: `apps/online-docs/package.json`

- [ ] **Step 1: Add build script to online-docs package.json**

In `apps/online-docs/package.json`, ensure the `scripts` section includes:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start"
}
```

(The scaffolder likely already added these. Verify and add if missing.)

- [ ] **Step 2: Add turbo.json input override for online-docs**

The current `turbo.json` build task has inputs scoped to `src/**` which won't match the docs app's `content/`, `app/`, and `components/` directories. Add a package-specific override.

In `turbo.json`, add to the `tasks` object, after the existing `"build"` entry:

```json
"online-docs#build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**"],
  "inputs": [
    "app/**/*.tsx",
    "app/**/*.ts",
    "components/**/*.tsx",
    "content/**/*.mdx",
    "content/**/*.json",
    "lib/**/*.ts",
    "geistdocs.tsx",
    "next.config.ts",
    "source.config.ts",
    "tsconfig.json"
  ]
}
```

Note: The package name in `turbo.json` overrides uses the `name` field from `apps/online-docs/package.json`. Check what the scaffolder set (likely `online-docs` or `docs`). Adjust the key accordingly (e.g., `@kata/online-docs#build` if namespaced).

- [ ] **Step 3: Verify turbo build includes docs**

Run: `turbo run build --dry-run`
Expected: `apps/online-docs` appears in the build task list.

Run: `turbo run build`
Expected: Docs site builds successfully alongside other packages.

- [ ] **Step 4: Commit**

```bash
git add turbo.json apps/online-docs/package.json
git commit -m "feat(M5): add docs site to Turborepo build pipeline with input overrides"
```

---

## Task 12: Update README and final cleanup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README references**

In `/Volumes/EVO/kata/kata-mono/README.md`:

- Find the line referencing `apps/online-docs` (around line 132) and update the description from "Online documentation site" to "Documentation site (Fumadocs/Next.js)" or similar
- Find any reference to Mintlify (around line 59 in the scripts section) and update to reflect the new `docs:dev` command

- [ ] **Step 2: Verify everything end-to-end**

Run through the verification checklist:

1. `bun install` — succeeds
2. `bun run docs:dev` — site at localhost:3001
3. Navigation — 8 sections in order
4. Seed pages — render correctly
5. Visual-explainer iframe — loads HTML file
6. `turbo run build` — includes docs site, succeeds
7. `bun run electron:start` — desktop app works after React 19 upgrade

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "chore(M5): update README to reflect Fumadocs docs site"
```

---

## Task Summary

| Task | Milestone | Description | Commit |
|---|---|---|---|
| 1 | M0 | React 18 → 19 upgrade | `feat(M0): upgrade React 18 → 19 across monorepo` |
| 2 | M1 | Clean workspace + scaffold Fumadocs | `feat(M1): scaffold Fumadocs app at apps/online-docs` |
| 3 | M1 | Site identity + Geist fonts | `feat(M1): add Kata branding, Geist fonts, geistdocs config` |
| 4 | M1 | Navigation structure | `feat(M1): configure navigation structure with meta.json files` |
| 5 | M2 | 17 seed MDX pages | `feat(M2): add 17 seed MDX pages across all sections` |
| 6 | M2 | VisualExplainerEmbed component | `feat(M2): add VisualExplainerEmbed client component with theme sync` |
| 7 | M2 | Migrate + embed visual-explainer HTML | `feat(M2): embed kata-step-auto-journeys visual explainer` |
| 8 | M3 | Geistdocs preset file | `feat(M3): add geistdocs preset for visual-explainer skill` |
| 9 | M3 | Update VE SKILL.md | (outside monorepo) |
| 10 | M4 | maintaining-monorepo-docs skill | (outside monorepo) |
| 11 | M5 | turbo.json + build script | `feat(M5): add docs site to Turborepo build pipeline` |
| 12 | M5 | README + final verification | `chore(M5): update README to reflect Fumadocs docs site` |
