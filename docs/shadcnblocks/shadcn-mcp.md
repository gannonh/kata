# Shadcn MCP

## Overview

Shadcn MCP enables AI assistants to browse, search, and install components from registries using natural language.

## What is MCP?

Model Context Protocol is an open protocol that enables AI assistants to securely connect to external data sources and tools. Capabilities:

- Browse components, blocks, and templates
- Search across multiple registries
- Install components conversationally
- Access public, private, and third-party sources

## Setup

### Cursor

```bash
pnpm dlx shadcn@latest mcp init --client cursor
```

Manual config in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot)

```bash
pnpm dlx shadcn@latest mcp init --client vscode
```

Manual config in `.vscode/mcp.json` follows the same structure.

### Claude Code

```bash
pnpm dlx shadcn@latest mcp init --client claude
```

Add to `.mcp.json` with identical server configuration.

### Codex (OpenAI)

```bash
pnpm dlx shadcn@latest mcp init --client codex
```

Configure in `~/.codex/config.toml`:

```toml
[mcp_servers.shadcn]
command = "npx"
args = ["shadcn@latest", "mcp"]
```

Restart your IDE after configuration changes.

## Shadcnblocks Integration

Configure in `components.json`:

```json
{
  "registries": {
    "@shadcnblocks": "https://shadcnblocks.com/r/{name}"
  }
}
```

### Example Prompts

- "Show me hero blocks from shadcnblocks"
- "Add a pricing section with comparison table"
- "Install a testimonial carousel"
- "Find blocks for a SaaS landing page"

### Pro Blocks Authentication

```json
{
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

## Supported Registries

- **shadcn/ui** — Official components
- **Shadcnblocks** — 500+ production-ready blocks
- **Third-Party** — Any shadcn-compatible registry
- **Private** — Internal company libraries with authentication

## Key Features

- Natural language component requests
- Context-aware AI discovery
- Instant direct installation
- Project structure awareness
- Secure authenticated access
- Full source code ownership
