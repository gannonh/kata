# E2E Tests for Kata Agents

End-to-end tests using Playwright with Electron support.

This repo has two distinct Electron e2e lanes:

- mocked e2e: deterministic local app harness using `KATA_TEST_MODE=1`
- live e2e: real credentials plus the persistent demo profile in `~/.kata-agents-demo`

## Quick Start

```bash
# From monorepo root (recommended)
bun run test:e2e           # Mocked Electron e2e
bun run test:e2e:headed    # Mocked Electron e2e, headed
bun run test:e2e:live      # Live tests with real credentials
bun run test:e2e:live:headed
bun run validate:local     # Local gate: CI checks + mocked e2e

# Or from apps/electron directory
cd apps/electron
bun run test:e2e           # Uses playwright.config.ts
bun run test:e2e:live      # Uses playwright.live.config.ts
```

There is currently no `test:e2e:all` script. Run `bun run test:e2e:live` explicitly when you want the full live lane.

## Lanes

### Mocked lane

- config: `apps/electron/playwright.config.ts`
- fixture: `apps/electron/e2e/fixtures/electron.fixture.ts`
- purpose: fast, deterministic renderer/app coverage
- worker count:
  - local: `4`
  - CI: `2`

### Live lane

- config: `apps/electron/playwright.live.config.ts`
- fixture: `apps/electron/e2e/fixtures/live.fixture.ts`
- purpose: real app behavior against real credentials and demo state
- worker count:
  - local: `1`
  - CI: not run

The live lane stays serial because it shares a persistent demo environment.

## Prerequisites

1. **Build the app first** - Tests run against the built Electron app:
   ```bash
   bun run electron:build
   ```

2. **For live tests** - Authenticate via the app to create credentials:
   ```bash
   # Credentials must exist at ~/.kata-agents/credentials.enc
   ```
3. **For live tests** - Expect a slower opt-in run:
   - mocked e2e is the default local gate
   - live e2e currently takes several minutes because it is serial

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
They do not run in the local pre-push / `validate:local` gate and they are not run in GitHub CI.
Some live scenarios may surface provider-side handled errors such as rate limiting. Those tests should verify the app handles that state correctly rather than assuming every run gets a successful model response.
Prefer running focused live files for the surface area you changed instead of rerunning the whole live suite every time.

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

Use the mocked fixture by default. Only add a live test when the behavior depends on real credentials, real provider flows, or persistent demo-state integration.
When adding live coverage, prefer small focused files per surface area so targeted reruns stay cheap.

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

See `playwright.config.ts` for the mocked/local lane and `playwright.live.config.ts`
for the live lane. The mocked lane runs with `4` workers locally and `2` in CI;
the live lane remains serial because it shares a persistent demo environment.

## CI Strategy

- `validate` in GitHub runs the fast code-quality/build gate via `bun run validate:ci`
- `e2e-mocked` in GitHub runs mocked Electron Playwright only
- `validate:local` runs `validate:ci` plus mocked e2e only
- live e2e stays local-only because it depends on real credentials and a persistent demo profile

## Current Gate Summary

- pre-push / local validate:
  - `bun run validate:local`
  - includes typecheck, lint, unit tests, coverage summary, Electron build, and mocked e2e
- GitHub CI:
  - `validate` job runs `bun run validate:ci`
  - `e2e-mocked` job runs `bun run test:e2e`
- manual/full validation:
  - `bun run test:e2e:live`
  - use file-targeted runs like `bun run test:e2e:live -- e2e/tests/live/settings.live.e2e.ts` when possible
