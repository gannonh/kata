# @craft-agent/shared

Core business logic package for Kata. Contains agent implementation, authentication, configuration, MCP client, channels, daemon, and more.

## Commands

```bash
cd packages/shared && bun run tsc --noEmit   # Typecheck
bun test packages/shared                      # Tests
bun run lint                                  # Lint (via Turborepo)
```

## Package Exports

```typescript
import { CraftAgent, getPermissionMode, setPermissionMode } from '@craft-agent/shared/agent';
import { loadStoredConfig, type Workspace } from '@craft-agent/shared/config';
import { getCredentialManager } from '@craft-agent/shared/credentials';
import { CraftMcpClient } from '@craft-agent/shared/mcp';
import { loadWorkspaceSources, type LoadedSource } from '@craft-agent/shared/sources';
import { loadStatusConfig, createStatus } from '@craft-agent/shared/statuses';
import { resolveTheme } from '@craft-agent/shared/config/theme';
import { debug } from '@craft-agent/shared/utils';
import { MessageQueue, createLineParser } from '@craft-agent/shared/daemon';
import { SlackChannelAdapter, WhatsAppChannelAdapter, resolveSessionKey } from '@craft-agent/shared/channels';
```

## Directory Structure

```
src/
├── agent/              # CraftAgent, session-scoped-tools, mode-manager, permissions-config
├── auth/               # OAuth, craft-token, claude-token, state
├── channels/           # Channel adapters (Slack, WhatsApp), trigger matching, session resolution
├── colors/             # Color utilities
├── config/             # Storage, preferences, models, theme, watcher
├── credentials/        # Secure credential storage (AES-256-GCM)
├── daemon/             # Daemon subprocess (SQLite queue, JSON-lines IPC, PID management)
├── docs/               # Documentation utilities
├── git/                # Git integration
├── headless/           # Non-interactive execution mode
├── icons/              # Icon assets
├── labels/             # Label management
├── mcp/                # MCP client and connection validation
├── network-interceptor.ts  # Fetch interceptor for API errors and MCP schema injection
├── plugins/            # Plugin system
├── prompts/            # System prompt generation
├── sessions/           # Session index, storage, persistence-queue
├── skills/             # Skill management
├── sources/            # Source types, storage, service
├── statuses/           # Dynamic status types, CRUD, storage
├── types/              # Additional type definitions
├── utils/              # Debug logging, file handling, summarization
├── validation/         # URL validation
├── version/            # Version management, install scripts
├── views/              # View definitions
├── workspaces/         # Workspace storage
├── branding.ts         # Branding constants
└── index.ts            # Main entry point
```

## Key Concepts

### Permission Modes (`src/agent/mode-manager.ts`)

Three-level permission system per session:

| Mode | Display | Behavior |
|------|---------|----------|
| `'safe'` | Explore | Read-only, blocks write operations |
| `'ask'` | Ask to Edit | Prompts for bash commands (default) |
| `'allow-all'` | Auto | Auto-approves all commands |

Per-session state. SHIFT+TAB cycles through modes.

### Configuration Storage

Multi-workspace configuration at `~/.craft-agent/config.json`. Supports multiple workspaces with separate MCP servers and sessions.

Permissions are customizable at two levels (additive merging):
- Workspace: `~/.craft-agent/workspaces/{id}/permissions.json`
- Source: `~/.craft-agent/workspaces/{id}/sources/{slug}/permissions.json`

### Credentials

AES-256-GCM encrypted file at `~/.craft-agent/credentials.enc`. `CredentialManager` provides the read/write API.

### Theme System

Cascading: app (`~/.craft-agent/theme.json`) → workspace (last wins). 6-color system: background, foreground, accent, info, success, destructive.

## Dependencies

- `@craft-agent/core` - Shared types
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK

## Testing Gotchas

- Importing `PERMISSION_MODE_CONFIG` from `mode-types.ts` in test files can resolve to `undefined` when running the full suite. Inline display name values instead of importing.
- `AskUserQuestion` is blocked in `disallowedTools` in `craft-agent.ts` because the renderer has no UI support. See KAT-293.
