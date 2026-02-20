# Kata Brand Guidelines

## Brand Identity

**Kata** (型) is an agent orchestration framework for spec-driven development. The brand reflects precision, discipline, and the methodical practice inherent in the Japanese concept of *kata* — a pattern or form perfected through repetition.

The visual identity draws from Japanese minimalism: aged paper, lacquered wood, and calligraphic ink.

---

## The Mark

### Primary Mark: 型

The Japanese kanji **型** (kata) serves as the primary brand mark. It means "form," "pattern," or "mold" — representing:

- **Structured methodology** — systematic approaches to building software
- **Practiced discipline** — patterns refined through repetition
- **Eastern philosophy** — precision meets flow

### Usage

| Context | Format |
|---------|--------|
| Terminal/CLI | Unicode character `型` |
| Marketing | `assets/logo.svg` (dark) or `assets/logo-light.svg` (light) |
| Horizontal lockup | `assets/wordmark.svg` |
| Social/hero | `assets/terminal.svg` |

### Clear Space

Maintain clear space around the mark equal to the height of the horizontal stroke in 型. In the logo SVG, this is built into the circular background.

---

## Color Palette

### Primary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Ink** | `#0d0d0d` | 13, 13, 13 | Primary background |
| **Paper** | `#faf8f5` | 250, 248, 245 | Primary text |
| **Amber** | `#d4a574` | 212, 165, 116 | Primary accent, highlights |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Charcoal** | `#1a1a1a` | 26, 26, 26 | Code backgrounds, cards |
| **Stone** | `#2d2d2d` | 45, 45, 45 | Borders, dividers |
| **Ash** | `#404040` | 64, 64, 64 | Muted text, secondary elements |

### Accent Variants

| Name | Hex | Usage |
|------|-----|-------|
| **Amber Glow** | `#e8c49a` | Hover states, highlights |
| **Amber Deep** | `#b8956a` | Pressed states, darker accents |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Bamboo** | `#8fa876` | Success, checkmarks, confirmations |
| **Moss** | `#5c6b4d` | Secondary success states |
| **Warning** | `#e0af68` | Cautions, pending states |
| **Error** | `#f7768e` | Errors, destructive actions |

### Color Ratios

- **Background**: 70% Ink
- **Text**: 20% Paper / Ash
- **Accent**: 10% Amber (used sparingly for impact)

---

## Typography

### Japanese Text

```
Primary: Noto Serif JP
Weight: 200 (Extra Light) for the 型 mark
Fallback: serif
```

The kanji mark uses an extra-light weight to maintain elegance and calligraphic quality.

### Body Text

```
Primary: Zen Kaku Gothic New
Weight: 400 (Regular), 500 (Medium)
Fallback: sans-serif
```

### Terminal / CLI

```
Primary: JetBrains Mono, SF Mono, Consolas, monospace
Weight: 400 (Regular), 500 (Medium)
```

All terminal output uses monospace fonts. JetBrains Mono is preferred for its excellent legibility and programming ligatures.

### Web / Documentation

```
Headers: Noto Serif JP (400 weight)
Body: Zen Kaku Gothic New (400 weight)
Code: JetBrains Mono (400 weight)
```

---

## Terminal Banner

The CLI banner combines ASCII art with the 型 mark:

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │    ██╗  ██╗ █████╗ ████████╗ █████╗       ╔═══════╗      │
  │    ██║ ██╔╝██╔══██╗╚══██╔══╝██╔══██╗      ║ ═╦═   ║      │
  │    █████╔╝ ███████║   ██║   ███████║      ╠══╬══╦═╣      │
  │    ██╔═██╗ ██╔══██║   ██║   ██╔══██║      ║  ║  ╠═╣      │
  │    ██║  ██╗██║  ██║   ██║   ██║  ██║      ╚══╩══╩═╝      │
  │    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝        型           │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
  v0.x.x · agent orchestration framework
```

### Banner Rules

- Frame and ASCII art: Amber (`#d4a574` / yellow ANSI `\x1b[33m`)
- The 型 character: Default terminal color (stands out against amber)
- Version/tagline: Dim (`\x1b[2m`)
- Box uses single-line drawing characters (`┌ ─ ┐ │ └ ┘`)

---

## Logo Assets

### `assets/logo.svg`

Dark mode primary logo. The 型 kanji centered in a circular container.

- Dimensions: 200×200
- Background: Ink (`#0d0d0d`)
- Border: Stone (`#2d2d2d`)
- Mark: Amber (`#d4a574`)

### `assets/logo-light.svg`

Light mode variant for light backgrounds.

- Background: Paper (`#faf8f5`)
- Border: Light gray (`#e5e7eb`)
- Mark: Ink (`#0d0d0d`)

### `assets/wordmark.svg`

Horizontal lockup with 型 + "KATA" wordmark.

- Dimensions: 400×120
- Layout: Kanji | divider | wordmark + tagline
- Use for: Headers, documentation, wider formats

### `assets/terminal.svg`

Hero/marketing asset showing the installation experience.

- Dimensions: 960×540
- Shows: Terminal window with large 型, wordmark, install output
- Use for: README, social media, landing pages

---

## Voice & Tone

### Principles

1. **Direct** — Imperative voice, no filler words
2. **Technical** — Precise terminology, not dumbed down
3. **Confident** — States facts, doesn't hedge
4. **Minimal** — Says what's needed, nothing more

### Do

- "Execute phase 3"
- "Plan created with 4 tasks"
- "Verification failed: 2 tests missing"

### Don't

- "Let me help you execute phase 3!"
- "I'd be happy to create a plan for you"
- "It looks like verification might have failed"

---

## Asset Inventory

| File | Purpose | Dimensions |
|------|---------|------------|
| `assets/logo.svg` | Dark mode logo | 200×200 |
| `assets/logo-light.svg` | Light mode logo | 200×200 |
| `assets/wordmark.svg` | Horizontal lockup | 400×120 |
| `assets/terminal.svg` | Marketing hero | 960×540 |
| `bin/install.js` | CLI banner | Terminal width |

---

## Co-branding

When Kata appears alongside other brands:

1. Maintain clear space around the 型 mark
2. Use the wordmark lockup, not isolated kanji
3. Match the host's light/dark context
4. Never alter colors or proportions

---

## Accessibility

- All color combinations meet WCAG AA contrast ratios
- The 型 mark is supplemented by "KATA" text in logos
- Terminal output uses semantic ANSI colors
- ASCII art banner has text equivalent in tagline
