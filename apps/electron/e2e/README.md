# E2E Tests for Kata Agents

End-to-end tests using Playwright with Electron support.

## Quick Start

```bash
# From monorepo root (recommended)
bun run test:e2e           # Mock tests
bun run test:e2e:live      # Live tests with real credentials

# Or from apps/electron directory
cd apps/electron
bun run test:e2e
bun run test:e2e:live
```

## Prerequisites

1. **Build the app first** - Tests run against the built Electron app:
   ```bash
   bun run electron:build
   ```

2. **For live tests** - Authenticate via the app to create credentials:
   ```bash
   # Credentials must exist at ~/.kata-agents/credentials.enc
   ```

## Directory Structure

```
e2e/
├── fixtures/
│   ├── electron.fixture.ts  # Mock mode (KATA_TEST_MODE=1)
│   └── live.fixture.ts      # Live mode (real credentials)
├── page-objects/
│   ├── ChatPage.ts          # Chat interactions
│   └── WorkspacePage.ts     # Workspace interactions
├── tests/
│   ├── *.e2e.ts             # Mock tests
│   └── live/                # Live tests (real API)
│       ├── auth.live.e2e.ts
│       ├── chat.live.e2e.ts
│       ├── session.live.e2e.ts
│       ├── git.live.e2e.ts
│       ├── permission.live.e2e.ts
│       ├── settings.live.e2e.ts
│       ├── workspaces.live.e2e.ts
│       ├── skills.live.e2e.ts
│       ├── mcps.live.e2e.ts
│       ├── folders.live.e2e.ts
│       ├── flags.live.e2e.ts
│       ├── status.live.e2e.ts
│       ├── labels.live.e2e.ts
│       └── updates.live.e2e.ts
└── helpers/
    └── test-utils.ts
```

## Live Tests

Live tests use real OAuth credentials and the demo environment (`~/.kata-agents-demo/`).

### Test Categories

| File | Feature Area | Description |
|------|--------------|-------------|
| `auth.live.e2e.ts` | Authentication | App loads with credentials, no onboarding |
| `chat.live.e2e.ts` | Chat | Send message, streaming response |
| `session.live.e2e.ts` | Sessions | Create session, persistence |
| `git.live.e2e.ts` | Git | Branch badge display |
| `permission.live.e2e.ts` | Permissions | Mode cycling (safe/ask/allow-all) |
| `settings.live.e2e.ts` | Settings | App/workspace settings, appearance |
| `workspaces.live.e2e.ts` | Workspaces | Switcher, create, manage |
| `skills.live.e2e.ts` | Skills | List, add, view info |
| `mcps.live.e2e.ts` | MCPs | Sources, connection status |
| `folders.live.e2e.ts` | Folders | Working directory, file preview |
| `flags.live.e2e.ts` | Flags | Flag/unflag sessions |
| `status.live.e2e.ts` | Status | Session status management |
| `labels.live.e2e.ts` | Labels | Label menu (#), configuration |
| `updates.live.e2e.ts` | Updates | Check for updates, version |

### Running Live Tests

```bash
# All live tests
bun run test:e2e:live

# Specific category
bun run test:e2e:live -- --grep "settings"

# Single file
bun run test:e2e:live -- e2e/tests/live/settings.live.e2e.ts

# Debug mode (step-through)
bun run test:e2e:live:debug

# Headed mode (watch execution)
bun run test:e2e:live:headed
```

### Demo Environment

The live fixture automatically sets up the demo environment on first run:

```
~/.kata-agents-demo/
├── config.json
└── workspaces/demo-workspace/
    ├── sessions/       # Seeded test sessions
    ├── sources/        # Filesystem MCP
    ├── skills/         # Copied from project
    ├── statuses/       # Default config
    └── labels/         # Default config

~/kata-agents-demo-repo/   # Demo git repo (working dir)
```

Manual setup commands:
```bash
bun run demo:setup    # Seed demo environment
bun run demo:reset    # Wipe and recreate
bun run demo:repo     # Create demo git repo
bun run demo:launch   # Setup + launch app
```

## Writing Tests

### Using Fixtures

```typescript
// Mock tests - isolated, fast
import { test, expect } from '../fixtures/electron.fixture'

// Live tests - real API, requires credentials
import { test, expect } from '../fixtures/live.fixture'

test('my test', async ({ electronApp, mainWindow }) => {
  // electronApp - Playwright Electron handle
  // mainWindow - Page object for the main window
})
```

### Using Page Objects

```typescript
import { test, expect } from '../fixtures/live.fixture'
import { ChatPage } from '../page-objects/ChatPage'

test('send message', async ({ mainWindow }) => {
  const chatPage = new ChatPage(mainWindow)
  await chatPage.sendMessage('Hello')
  // Live tests need longer timeouts
  await chatPage.waitForResponse({ timeout: 30_000 })
})
```

## Debugging

1. **Debug mode** - `bun run test:e2e:live:debug`
2. **Headed mode** - `bun run test:e2e:live:headed`
3. **Screenshots** - Auto-captured on failure
4. **Videos** - Retained on failure in `playwright-report/`
5. **Traces** - Captured on first retry

## Configuration

See `playwright.config.ts` for timeout, retry, and reporter settings.
