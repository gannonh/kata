# @kata/core

Shared TypeScript types and utilities for the Kata monorepo. Currently exports types and a debug utility stub. Actual implementation lives in `@kata/shared`.

## Commands

```bash
pnpm --dir packages/core run typecheck
pnpm --dir packages/core exec vitest run
```

## Usage

```typescript
import type { Workspace, Session, Message, AgentEvent } from '@kata/core';
import { generateMessageId, debug } from '@kata/core';
```

## Key Design Decisions

- **Session is the primary isolation boundary**, not workspaces. Each session maps 1:1 with an SDK session.
- **MCP auth is separate from Craft OAuth.** `craft_oauth::global` is for the Craft API only. Each MCP server uses its own OAuth via `workspace_oauth::{workspaceId}`.
- Use `generateMessageId()` for consistent ID format: `"msg-1702736400000-a1b2c3"`.

## Peer Dependencies

- `@anthropic-ai/claude-agent-sdk`
- `@anthropic-ai/sdk`
- `@modelcontextprotocol/sdk`
