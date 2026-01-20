# Kata Brand Guidelines

## Brand Identity

**Kata** (型) is an agent orchestration framework for spec-driven development. The brand reflects precision, discipline, and the methodical practice inherent in the Japanese concept of *kata* — a pattern or form perfected through repetition.

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
| **Kata Blue** | `#7aa2f7` | 122, 162, 247 | Primary accent, links, highlights |
| **Deep Slate** | `#0f0f14` | 15, 15, 20 | Primary background |
| **Soft White** | `#c0caf5` | 192, 202, 245 | Primary text |

### Secondary Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Muted** | `#565f89` | 86, 95, 137 | Secondary text, borders |
| **Dim** | `#414868` | 65, 72, 104 | Tertiary text, disabled states |
| **Border** | `#24283b` | 36, 40, 59 | Dividers, frames |

### Semantic Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Success** | `#9ece6a` | Checkmarks, confirmations |
| **Warning** | `#e0af68` | Cautions, pending states |
| **Error** | `#f7768e` | Errors, destructive actions |
| **Info** | `#7dcfff` | Informational highlights |

### Color Ratios

- **Background**: 70% Deep Slate
- **Text**: 20% Soft White / Muted
- **Accent**: 10% Kata Blue (used sparingly for impact)

---

## Typography

### Terminal / CLI

```
Primary: JetBrains Mono, SF Mono, Consolas, monospace
```

All terminal output uses monospace fonts. JetBrains Mono is preferred for its excellent legibility and programming ligatures.

### Japanese Text

```
Primary: Noto Sans JP, Hiragino Kaku Gothic Pro, Yu Gothic, sans-serif
Weight: 300 (Light) for the 型 mark
```

The kanji mark uses a light weight to maintain elegance and avoid visual heaviness.

### Web / Documentation

```
Headers: JetBrains Mono (500 weight)
Body: System sans-serif stack
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

- Frame and ASCII art: Kata Blue (`#7aa2f7` / cyan ANSI)
- The 型 character: Default terminal color (stands out against cyan)
- Version/tagline: Dim (`\x1b[2m`)
- Box uses single-line drawing characters (`┌ ─ ┐ │ └ ┘`)

---

## Logo Assets

### `assets/logo.svg`

Dark mode primary logo. The 型 kanji centered in a circular container.

- Dimensions: 200×200
- Background: Deep Slate (`#0f0f14`)
- Border: Border color (`#24283b`)
- Mark: Kata Blue (`#7aa2f7`)

### `assets/logo-light.svg`

Light mode variant for light backgrounds.

- Background: White (`#ffffff`)
- Border: Light gray (`#e5e7eb`)
- Mark: Deep Slate (`#0f0f14`)

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
