#!/usr/bin/env bun
/**
 * Demo Environment Setup
 *
 * Creates a seeded demo config directory at ~/.kata-agents-demo/
 * for demos and live E2E tests. Uses existing Claude OAuth credentials
 * from ~/.kata-agents/credentials.enc (hardcoded path, unaffected by KATA_CONFIG_DIR).
 *
 * Usage:
 *   bun run scripts/setup-demo.ts          # Create if missing (no-op if exists)
 *   bun run scripts/setup-demo.ts --reset  # Wipe and recreate from scratch
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { createWorkspaceAtPath } from '../packages/shared/src/workspaces/storage.ts';
import { toPortablePath } from '../packages/shared/src/utils/paths.ts';
import type { StoredMessage } from '@craft-agent/core/types';
import type { SessionHeader } from '../packages/shared/src/sessions/types.ts';
import type { FolderSourceConfig } from '../packages/shared/src/sources/types.ts';

// ============================================================
// Constants
// ============================================================

const HOME = homedir();
const DEMO_DIR = join(HOME, '.kata-agents-demo');
const CREDENTIALS_PATH = join(HOME, '.kata-agents', 'credentials.enc');
const WORKSPACE_DIR = join(DEMO_DIR, 'workspaces', 'demo-workspace');
const DEMO_REPO = join(HOME, 'kata-agents-demo-repo');

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const reset = args.includes('--reset');

if (existsSync(DEMO_DIR) && !reset) {
  console.log('Demo environment already exists at', DEMO_DIR);
  console.log('Use --reset to wipe and recreate.');
  process.exit(0);
}

if (reset && existsSync(DEMO_DIR)) {
  console.log('Resetting demo environment...');
  rmSync(DEMO_DIR, { recursive: true });
}

if (reset && existsSync(DEMO_REPO)) {
  console.log('Resetting demo repo...');
  rmSync(DEMO_REPO, { recursive: true });
}

// ============================================================
// Credential check
// ============================================================

if (!existsSync(CREDENTIALS_PATH)) {
  console.warn('WARNING: ~/.kata-agents/credentials.enc not found.');
  console.warn('Demo will launch without auth (onboarding screen will appear).');
}

// ============================================================
// Global config
// ============================================================

console.log('Creating demo environment at', DEMO_DIR);
mkdirSync(DEMO_DIR, { recursive: true });

const now = Date.now();

const globalConfig = {
  authType: 'oauth_token',
  workspaces: [
    {
      id: 'demo-workspace',
      name: 'Demo Workspace',
      rootPath: toPortablePath(WORKSPACE_DIR),
      createdAt: now,
    },
  ],
  activeWorkspaceId: 'demo-workspace',
  activeSessionId: null,
};

writeFileSync(join(DEMO_DIR, 'config.json'), JSON.stringify(globalConfig, null, 2));

// ============================================================
// Workspace (uses createWorkspaceAtPath for proper defaults)
// ============================================================

const workspaceConfig = createWorkspaceAtPath(WORKSPACE_DIR, 'Demo Workspace', {
  workingDirectory: join(HOME, 'kata-agents-demo-repo'),
  enabledSourceSlugs: ['filesystem'],
  permissionMode: 'ask',
});

// Override localMcpServers after creation
const wsConfigPath = join(WORKSPACE_DIR, 'config.json');
const wsConfig = JSON.parse(
  (await Bun.file(wsConfigPath).text())
);
wsConfig.localMcpServers = { enabled: true };
writeFileSync(wsConfigPath, JSON.stringify(wsConfig, null, 2));

// ============================================================
// Helper: generate message ID
// ============================================================

let msgCounter = 0;
function msgId(ts: number): string {
  msgCounter++;
  const rand = Math.random().toString(36).slice(2, 8);
  return `msg-${ts}-${rand}${msgCounter}`;
}

function toolUseId(): string {
  return `toolu_${Math.random().toString(36).slice(2, 14)}`;
}

// ============================================================
// Helper: write session JSONL
// ============================================================

function writeSession(
  sessionId: string,
  name: string,
  messages: StoredMessage[],
  opts: {
    isFlagged?: boolean;
    todoState?: string;
    labels?: string[];
  } = {}
) {
  const sessionDir = join(WORKSPACE_DIR, 'sessions', sessionId);
  mkdirSync(sessionDir, { recursive: true });

  const firstUser = messages.find(m => m.type === 'user');
  const preview = firstUser?.content?.substring(0, 150);

  const lastMsg = messages[messages.length - 1];
  let lastMessageRole: SessionHeader['lastMessageRole'];
  if (lastMsg) {
    const r = lastMsg.type;
    if (r === 'user' || r === 'assistant' || r === 'plan' || r === 'tool' || r === 'error') {
      lastMessageRole = r;
    }
  }

  let lastFinalMessageId: string | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.type === 'assistant' && !m.isIntermediate) {
      lastFinalMessageId = m.id;
      break;
    }
  }

  const createdAt = messages[0]?.timestamp ?? now;
  const lastUsedAt = lastMsg?.timestamp ?? now;

  const header: SessionHeader = {
    id: sessionId,
    workspaceRootPath: toPortablePath(WORKSPACE_DIR),
    createdAt,
    lastUsedAt,
    lastMessageAt: lastUsedAt,
    name,
    isFlagged: opts.isFlagged,
    todoState: opts.todoState,
    labels: opts.labels,
    permissionMode: 'ask',
    enabledSourceSlugs: ['filesystem'],
    workingDirectory: toPortablePath(DEMO_REPO),
    sdkCwd: toPortablePath(DEMO_REPO),
    messageCount: messages.length,
    lastMessageRole,
    preview,
    lastFinalMessageId,
    tokenUsage: {
      inputTokens: Math.floor(Math.random() * 5000) + 500,
      outputTokens: Math.floor(Math.random() * 2000) + 200,
      totalTokens: 0,
      contextTokens: 0,
      costUsd: 0,
    },
  };
  header.tokenUsage.totalTokens = header.tokenUsage.inputTokens + header.tokenUsage.outputTokens;
  header.tokenUsage.contextTokens = header.tokenUsage.inputTokens;
  header.tokenUsage.costUsd = parseFloat(
    ((header.tokenUsage.inputTokens * 0.003 + header.tokenUsage.outputTokens * 0.015) / 1000).toFixed(4)
  );

  const lines = [
    JSON.stringify(header),
    ...messages.map(m => JSON.stringify(m)),
  ];

  writeFileSync(join(sessionDir, 'session.jsonl'), lines.join('\n') + '\n');
}

// ============================================================
// Session 1: Code Review (in-progress, flagged, 8 messages)
// ============================================================

const ts1 = new Date('2026-02-01T10:00:00Z').getTime();
const toolId1 = toolUseId();

const session1Messages: StoredMessage[] = [
  {
    id: msgId(ts1),
    type: 'user',
    content: 'Review the authentication module in src/auth.ts for security issues and best practices.',
    timestamp: ts1,
  },
  {
    id: msgId(ts1 + 1000),
    type: 'assistant',
    content: "I'll read the authentication module and review it for security concerns.",
    timestamp: ts1 + 1000,
    isIntermediate: true,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts1 + 2000),
    type: 'tool',
    content: '',
    timestamp: ts1 + 2000,
    toolName: 'Read',
    toolUseId: toolId1,
    toolInput: { file_path: '~/kata-agents-demo-repo/src/index.ts' },
    toolResult: 'export function authenticate(token: string) {\n  // TODO: add rate limiting\n  return verifyJWT(token);\n}\n',
    toolStatus: 'completed',
    toolDuration: 120,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts1 + 3000),
    type: 'assistant',
    content: "Here are the key findings from the code review:\n\n1. **Missing rate limiting** - The `authenticate` function has no rate limiting, making it vulnerable to brute-force attacks.\n\n2. **No input validation** - The token parameter isn't validated before being passed to `verifyJWT`.\n\n3. **Error handling** - No try/catch around JWT verification. Invalid tokens could throw unhandled exceptions.\n\nRecommendations:\n- Add rate limiting middleware\n- Validate token format before verification\n- Wrap JWT verification in try/catch with proper error responses",
    timestamp: ts1 + 3000,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts1 + 60000),
    type: 'user',
    content: 'Can you fix the rate limiting issue?',
    timestamp: ts1 + 60000,
  },
  {
    id: msgId(ts1 + 61000),
    type: 'assistant',
    content: "I'll add a simple in-memory rate limiter to the authenticate function.",
    timestamp: ts1 + 61000,
    isIntermediate: true,
    turnId: 'turn-2',
  },
  {
    id: msgId(ts1 + 62000),
    type: 'tool',
    content: '',
    timestamp: ts1 + 62000,
    toolName: 'Edit',
    toolUseId: toolUseId(),
    toolInput: {
      file_path: '~/kata-agents-demo-repo/src/index.ts',
      old_string: 'export function authenticate',
      new_string: 'const rateLimiter = new Map();\n\nexport function authenticate',
    },
    toolResult: 'File edited successfully.',
    toolStatus: 'completed',
    toolDuration: 85,
    turnId: 'turn-2',
  },
  {
    id: msgId(ts1 + 63000),
    type: 'assistant',
    content: "I've added a rate limiter Map at the module level. The authenticate function now tracks request counts per IP and rejects requests that exceed the threshold. You should also consider moving to a Redis-based solution for production deployments with multiple server instances.",
    timestamp: ts1 + 63000,
    turnId: 'turn-2',
  },
];

writeSession('260201-bright-meadow', 'Code Review', session1Messages, {
  isFlagged: true,
  todoState: 'in-progress',
});

// ============================================================
// Session 2: API Integration (todo, 6 messages)
// ============================================================

const ts2 = new Date('2026-02-01T14:00:00Z').getTime();

const session2Messages: StoredMessage[] = [
  {
    id: msgId(ts2),
    type: 'user',
    content: 'Help me integrate the Stripe payment API into our checkout flow.',
    timestamp: ts2,
  },
  {
    id: msgId(ts2 + 1000),
    type: 'assistant',
    content: "I can help with the Stripe integration. Let me outline the steps:\n\n1. Install the Stripe SDK\n2. Create a payment intent endpoint\n3. Add the checkout form component\n4. Handle webhooks for payment confirmation\n\nWhich step would you like to start with?",
    timestamp: ts2 + 1000,
  },
  {
    id: msgId(ts2 + 60000),
    type: 'user',
    content: "Let's start with the payment intent endpoint.",
    timestamp: ts2 + 60000,
  },
  {
    id: msgId(ts2 + 61000),
    type: 'assistant',
    content: "Here's a payment intent endpoint using Express:\n\n```typescript\nimport Stripe from 'stripe';\n\nconst stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);\n\napp.post('/api/create-payment-intent', async (req, res) => {\n  const { amount, currency } = req.body;\n  const paymentIntent = await stripe.paymentIntents.create({\n    amount,\n    currency: currency || 'usd',\n  });\n  res.json({ clientSecret: paymentIntent.client_secret });\n});\n```\n\nYou'll need to set `STRIPE_SECRET_KEY` in your environment variables.",
    timestamp: ts2 + 61000,
  },
  {
    id: msgId(ts2 + 120000),
    type: 'user',
    content: 'What about input validation and error handling?',
    timestamp: ts2 + 120000,
  },
  {
    id: msgId(ts2 + 121000),
    type: 'assistant',
    content: "Good point. Here's a more robust version with validation:\n\n- Validate `amount` is a positive integer (Stripe uses cents)\n- Validate `currency` against supported currencies\n- Add try/catch for Stripe API errors\n- Return appropriate HTTP status codes\n- Log errors for monitoring\n\nWant me to write the full implementation with these improvements?",
    timestamp: ts2 + 121000,
  },
];

writeSession('260201-swift-river', 'API Integration', session2Messages, {
  todoState: 'todo',
});

// ============================================================
// Session 3: Debug Session (needs-review, 10 messages)
// ============================================================

const ts3 = new Date('2026-02-02T09:00:00Z').getTime();
const toolId3a = toolUseId();
const toolId3b = toolUseId();
const toolId3c = toolUseId();

const session3Messages: StoredMessage[] = [
  {
    id: msgId(ts3),
    type: 'user',
    content: "There's a memory leak in the WebSocket server. Connections aren't being cleaned up properly when clients disconnect.",
    timestamp: ts3,
  },
  {
    id: msgId(ts3 + 1000),
    type: 'assistant',
    content: "I'll investigate the WebSocket connection handling. Let me look at the server code.",
    timestamp: ts3 + 1000,
    isIntermediate: true,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts3 + 2000),
    type: 'tool',
    content: '',
    timestamp: ts3 + 2000,
    toolName: 'Bash',
    toolUseId: toolId3a,
    toolInput: { command: 'grep -rn "ws.on" src/' },
    toolResult: 'src/server.ts:45:  ws.on("message", handleMessage);\nsrc/server.ts:46:  ws.on("close", () => console.log("closed"));\n',
    toolStatus: 'completed',
    toolDuration: 250,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts3 + 3000),
    type: 'assistant',
    content: "Found it. The `close` handler only logs but doesn't clean up resources. Let me check what needs to be cleaned up.",
    timestamp: ts3 + 3000,
    isIntermediate: true,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts3 + 4000),
    type: 'tool',
    content: '',
    timestamp: ts3 + 4000,
    toolName: 'Read',
    toolUseId: toolId3b,
    toolInput: { file_path: '~/kata-agents-demo-repo/src/utils.ts' },
    toolResult: 'const connections = new Map<string, WebSocket>();\nconst subscriptions = new Map<string, Set<string>>();\n\nexport function addConnection(id: string, ws: WebSocket) {\n  connections.set(id, ws);\n}\n',
    toolStatus: 'completed',
    toolDuration: 95,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts3 + 5000),
    type: 'assistant',
    content: "The issue is clear: connections and subscriptions are added to Maps but never removed on disconnect. Both `connections` and `subscriptions` Maps grow indefinitely.\n\nThe fix needs to:\n1. Remove the connection from the `connections` Map\n2. Remove all subscriptions for that connection\n3. Clean up any event listeners",
    timestamp: ts3 + 5000,
    turnId: 'turn-1',
  },
  {
    id: msgId(ts3 + 60000),
    type: 'user',
    content: 'Fix it please.',
    timestamp: ts3 + 60000,
  },
  {
    id: msgId(ts3 + 61000),
    type: 'assistant',
    content: "I'll add proper cleanup in the close handler.",
    timestamp: ts3 + 61000,
    isIntermediate: true,
    turnId: 'turn-2',
  },
  {
    id: msgId(ts3 + 62000),
    type: 'tool',
    content: '',
    timestamp: ts3 + 62000,
    toolName: 'Edit',
    toolUseId: toolId3c,
    toolInput: {
      file_path: '~/kata-agents-demo-repo/src/utils.ts',
      old_string: 'console.log("closed")',
      new_string: 'removeConnection(id)',
    },
    toolResult: 'File edited successfully.',
    toolStatus: 'completed',
    toolDuration: 110,
    turnId: 'turn-2',
  },
  {
    id: msgId(ts3 + 63000),
    type: 'assistant',
    content: "I've added a `removeConnection` function that:\n- Removes the WebSocket from the `connections` Map\n- Iterates through `subscriptions` and removes any entries for this connection ID\n- Deletes empty subscription sets to prevent orphaned keys\n\nThe close handler now calls `removeConnection(id)` instead of just logging. This should resolve the memory leak. You can verify by monitoring the Map sizes before and after connections disconnect.",
    timestamp: ts3 + 63000,
    turnId: 'turn-2',
  },
];

writeSession('260202-quiet-forest', 'Debug Session', session3Messages, {
  todoState: 'needs-review',
});

// ============================================================
// Session 4: Quick Question (done, 2 messages)
// ============================================================

const ts4 = new Date('2026-02-02T11:00:00Z').getTime();

const session4Messages: StoredMessage[] = [
  {
    id: msgId(ts4),
    type: 'user',
    content: "What's the difference between `interface` and `type` in TypeScript?",
    timestamp: ts4,
  },
  {
    id: msgId(ts4 + 1000),
    type: 'assistant',
    content: "Key differences:\n\n**`interface`:**\n- Declaration merging (multiple declarations with same name are merged)\n- Can be extended with `extends`\n- Preferred for object shapes and class contracts\n\n**`type`:**\n- Can represent unions, intersections, primitives, tuples\n- No declaration merging\n- Uses `&` for intersection instead of `extends`\n\nIn practice, use `interface` for object shapes you expect to extend or implement, and `type` for unions, computed types, or when you need features interfaces don't support.",
    timestamp: ts4 + 1000,
  },
];

writeSession('260202-golden-dawn', 'Quick Question', session4Messages, {
  todoState: 'done',
});

// ============================================================
// Filesystem MCP source
// ============================================================

const sourcesDir = join(WORKSPACE_DIR, 'sources', 'filesystem');
mkdirSync(sourcesDir, { recursive: true });

const sourceConfig: FolderSourceConfig = {
  id: 'filesystem_demo001',
  name: 'Filesystem',
  slug: 'filesystem',
  enabled: true,
  provider: 'filesystem',
  type: 'mcp',
  mcp: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', toPortablePath(DEMO_REPO)],
  },
  connectionStatus: 'untested',
  createdAt: now,
  updatedAt: now,
};

writeFileSync(join(sourcesDir, 'config.json'), JSON.stringify(sourceConfig, null, 2));

writeFileSync(
  join(sourcesDir, 'guide.md'),
  `# Filesystem Source

Provides read/write access to the demo project repository at \`~/kata-agents-demo-repo\`.

## Available Operations

- Read files and directories
- Write and edit files
- Search for content across the project

## Usage

Reference files by their path relative to the project root. The agent can read,
create, and modify files within the demo repository.
`
);

// ============================================================
// Skills (copy from project source)
// ============================================================

const projectSkillsDir = resolve(import.meta.dir, '..', 'skills');
const demoSkillsDir = join(WORKSPACE_DIR, 'skills');

if (existsSync(projectSkillsDir)) {
  cpSync(projectSkillsDir, demoSkillsDir, { recursive: true });
  console.log('Copied skills from', projectSkillsDir);
}

// ============================================================
// Done
// ============================================================

console.log('Demo environment created successfully.');
console.log('');
console.log('  Config dir:  ', DEMO_DIR);
console.log('  Workspace:   ', WORKSPACE_DIR);
console.log('  Sessions:     4 seeded sessions');
console.log('  Sources:      1 (filesystem MCP)');
console.log('');
console.log('Launch with:    bun run demo:launch');
