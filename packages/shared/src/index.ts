/**
 * @kata/shared
 *
 * Shared business logic for Kata Agents.
 * Used by the Electron app.
 *
 * Import specific modules via subpath exports:
 *   import { CraftAgent } from '@kata/shared/agent';
 *   import { loadStoredConfig } from '@kata/shared/config';
 *   import { getCredentialManager } from '@kata/shared/credentials';
 *   import { CraftMcpClient } from '@kata/shared/mcp';
 *   import { debug } from '@kata/shared/utils';
 *   import { loadSource, createSource, getSourceCredentialManager } from '@kata/shared/sources';
 *   import { createWorkspace, loadWorkspace } from '@kata/shared/workspaces';
 *
 * Available modules:
 *   - agent: CraftAgent SDK wrapper, plan tools
 *   - auth: OAuth, token management, auth state
 *   - clients: Craft API client
 *   - config: Storage, models, preferences
 *   - credentials: Encrypted credential storage
 *   - headless: Non-interactive execution mode
 *   - mcp: MCP client, connection validation
 *   - prompts: System prompt generation
 *   - sources: Workspace-scoped source management (MCP, API, local)
 *   - utils: Debug logging, file handling, summarization
 *   - validation: URL validation
 *   - version: Version and installation management
 *   - workspaces: Workspace management (top-level organizational unit)
 */

// Export branding (standalone, no dependencies)
export * from './branding.ts';
