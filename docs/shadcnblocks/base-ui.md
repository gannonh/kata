# Base UI

## Overview

Shadcnblocks supports Base UI as an alternative to Radix UI, letting you choose which primitive library powers your shadcn/ui components.

## What is Base UI?

A headless component library from the MUI team:

- **Zero styling** — Pure logic and accessibility without CSS overrides
- **Smaller bundle size** — Lightweight primitives with minimal overhead
- **Familiar API** — Similar patterns to Radix UI
- **Active development** — Maintained by MUI

## Radix UI vs Base UI

| Feature | Radix UI | Base UI |
|---------|----------|---------|
| Maintainer | WorkOS | MUI |
| Bundle size | Larger | Smaller |
| Component count | More | Growing |
| Ecosystem | Established | Emerging |

**Choose Radix UI** for stability, comprehensive primitives, and battle-tested reliability.

**Choose Base UI** for smaller bundles, active MUI backing, and a clear long-term roadmap.

## Configuration

The `style` property in `components.json` determines which primitive library the CLI uses:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-vega"
}
```

Style format: `{library}-{style}`

- Base UI: `base-vega`, `base-nova`, `base-maia`, `base-lyra`, `base-mira`
- Radix UI: `radix-vega`, `radix-nova`, `radix-maia`, `radix-lyra`, `radix-mira`

## Getting Started

### 1. Update components.json

Set a Base UI style like `base-vega`.

### 2. Reinstall Components

```bash
npx shadcn@latest add --all --overwrite
```

### 3. Install Blocks

```bash
npx shadcn@latest add @shadcnblocks/hero1
```

## asChild vs render

The CLI automatically converts patterns between libraries.

**Radix UI:**
```jsx
<Button asChild>
  <a href="/about">About</a>
</Button>
```

**Base UI:**
```jsx
<Button render={<a href="/about" />}>
  About
</Button>
```

The CLI handles this conversion automatically. Manual copy/paste requires manual conversion.

## Block Compatibility

Most blocks require no changes when switching libraries. For edge cases, dedicated Base UI versions are available via `@shadcnblocks/base/` prefix:

```bash
npx shadcn@latest add @shadcnblocks/base/sidebar1
```
