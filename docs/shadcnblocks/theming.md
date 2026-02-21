# Theming

## Overview

Shadcnblocks uses the standard shadcn/ui theming system built on CSS variables and Tailwind CSS.

## Getting Started

Download the foundational `globals.css` file containing:
- Light and dark mode color variables
- Chart colors for data visualization
- Sidebar-specific variables
- Shadow and radius tokens
- Font family definitions

## CSS Variables

**Core color variables:**
- `--background`, `--foreground`
- `--primary`, `--secondary`, `--accent`, `--destructive`

**Additional tokens:**
- Chart colors (five variants)
- Sidebar-specific options
- Border radius settings
- Shadow definitions
- Font stack variables

## Dark Mode

Apply a `.dark` class to the HTML or body element. All color variables must have both light and dark variants:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}
```

## Supported Color Formats

- **OKLCH** (recommended) — Better perceptual uniformity
- **HSL** — Traditional format
- **RGB** — Standard RGB

## Customization

1. Direct CSS variable changes in `globals.css`
2. Pre-made themes from shadcn, Tweakcn, Styleglide, or JLN UI
3. Border radius via `--radius` variable
4. Custom font integration

## Tailwind CSS v4

Requires Tailwind CSS v4, which uses CSS-first configuration with dark mode variants and plugin support directly in CSS files.
