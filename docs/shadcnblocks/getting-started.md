# Getting Started with Shadcn Blocks

## Overview

Shadcn Blocks is a library of pre-built React components styled with Tailwind CSS and shadcn/ui.

## Prerequisites

- React
- Tailwind CSS
- shadcn/ui

Projects must have two files:
1. `components.json` — CLI configuration
2. `globals.css` — CSS variables for theming

## Installation

### CLI (Recommended)

```bash
npx shadcn add @shadcnblocks/hero-1
```

Alternative package managers:

```bash
pnpm dlx shadcn add @shadcnblocks/hero-1
yarn dlx shadcn add @shadcnblocks/hero-1
bunx shadcn add @shadcnblocks/hero-1
```

### Copy & Paste

Copy source code from the Code tab on block pages. Requires:
- Manual NPM package installation
- Separate installation of component dependencies

### Pro Blocks Authentication

1. Generate a key from Dashboard → API Keys
2. Add to `.env`: `SHADCNBLOCKS_API_KEY=sk_live_your_api_key_here`
3. Update `components.json` with authentication headers

## CLI Advantages

- Respects project-specific `components.json` settings
- Selects appropriate UI libraries (Radix or Base UI)
- Handles dependencies automatically
- Installs required npm packages

## Project Setup

### Tailwind Configuration

```bash
npm install @tailwindcss/typography tw-animate-css
```

Download the provided `globals.css` file containing CSS variables for light and dark mode.
