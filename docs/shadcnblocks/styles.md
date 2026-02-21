# Component Styles

## Overview

Shadcnblocks offers five distinct component styles that modify visual appearance while preserving functionality. These align with options in Shadcn UI Create.

## Available Styles

### Vega (New York)
- **Border radius:** Medium (0.5rem)
- **Spacing:** Balanced
- **Use case:** General-purpose projects, professional applications
- Default style matching original shadcn/ui "New York" variant

### Nova
- **Border radius:** Small
- **Spacing:** Tight
- **Use case:** Data-heavy interfaces, dashboards

### Maia
- **Border radius:** Large (full rounded)
- **Spacing:** Generous
- **Use case:** Consumer applications, friendly interfaces

### Lyra
- **Border radius:** None (square corners)
- **Spacing:** Balanced
- **Use case:** Developer tools, technical interfaces

### Mira
- **Border radius:** Small
- **Spacing:** Minimal
- **Use case:** Complex dashboards, data tables

## Configuration

Styles work with both Radix UI and Base UI. Set in `components.json`:

```json
{
  "style": "radix-maia",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

## Installation

```bash
npx shadcn@latest add button card dialog
npx shadcn@latest add @shadcnblocks/hero1
```

## Switching Styles

Update `style` in `components.json`, then reinstall:

```bash
npx shadcn@latest add --all --overwrite
```

Or update specific components:

```bash
npx shadcn@latest add button card input --overwrite
```

## Styles vs Themes

- **Styles** control border radius, padding, spacing, and proportions
- **Themes** control colors (primary, secondary, backgrounds)

Don't mix styles within a single project — inconsistent spacing and visual rhythm result.
