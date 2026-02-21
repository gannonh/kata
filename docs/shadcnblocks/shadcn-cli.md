# Shadcn CLI

## Overview

Integration with shadcn CLI v3.0, featuring namespaced registries and private registry authentication for accessing pro blocks and components.

## Setup

### 1. Configure components.json

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-vega",
  "rsc": false,
  "registries": {
    "@shadcnblocks": {
      "url": "https://shadcnblocks.com/r/{name}",
      "headers": {
        "Authorization": "Bearer ${SHADCNBLOCKS_API_KEY}"
      }
    }
  }
}
```

### 2. Generate API Key

Visit the dashboard's API Keys section to create a new key with an optional expiration date.

### 3. Install Components

```bash
npx shadcn add @shadcnblocks/hero125
npx shadcn add @shadcnblocks/pricing3
```

## Supported Technologies

shadcn/ui, Tailwind CSS, React, Astro, Next.js, Figma
