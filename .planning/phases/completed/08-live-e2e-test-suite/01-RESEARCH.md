# Phase 1: Live E2E Test Suite - Research

**Researched:** 2026-02-04
**Domain:** Playwright Electron E2E testing with live credentials
**Confidence:** HIGH

## Summary

The existing E2E infrastructure provides a solid foundation for live tests. The project has:
- `live.fixture.ts` - Electron fixture for live testing against `~/.kata-agents-demo/`
- `demo:*` scripts for seeding demo environment with sessions, sources, and git repo
- Page Object Model pattern with `ChatPage` and `WorkspacePage` classes
- Standard Playwright configuration with video/screenshot capture on failure

Live E2E tests extend the mock-based fixtures by removing `KATA_TEST_MODE` and pointing `KATA_CONFIG_DIR` to `~/.kata-agents-demo/`. The demo environment uses real OAuth credentials from `~/.kata-agents/credentials.enc` (hardcoded path) while maintaining isolation from production data.

**Primary recommendation:** Create live test files using `live.fixture.ts`, extend Page Object classes with live-specific helpers, and add `data-testid` attributes to UI components for reliable selectors.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.50.0 | E2E test framework | Official Electron support via CDP, built-in assertions, fixtures |
| electron-playwright-helpers | ^1.7.0 | Electron testing utilities | Simplifies common Electron testing patterns |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Bun test runner | (runtime) | Unit tests | Use for non-UI business logic tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright | WebDriverIO | WebDriverIO has Electron support but Playwright is already integrated and working |
| Custom fixtures | electron-playwright-helpers fixtures | Project already has custom fixtures; helpers provide utilities not full replacement |

**Installation:**
Already installed - no additional packages needed.

## Architecture Patterns

### Recommended Project Structure
```
apps/electron/e2e/
├── fixtures/
│   ├── electron.fixture.ts    # Mock tests (CI smoke tests)
│   ├── live.fixture.ts        # Live tests (real credentials)
│   └── shared/                # Shared fixture utilities
├── page-objects/
│   ├── ChatPage.ts            # Chat interaction abstraction
│   ├── WorkspacePage.ts       # Workspace management abstraction
│   └── SessionPage.ts         # Session lifecycle abstraction (new)
├── tests/
│   ├── app-launch.e2e.ts      # Mock: basic app launch
│   ├── session-lifecycle.e2e.ts # Mock: basic window behavior
│   ├── git-status.e2e.ts      # Mock: non-git directory
│   └── live/                  # NEW: Live test directory
│       ├── auth.live.e2e.ts   # E2E-03: Auth verification
│       ├── chat.live.e2e.ts   # E2E-04: Chat round-trip
│       ├── session.live.e2e.ts # E2E-05: Session lifecycle
│       ├── permission.live.e2e.ts # E2E-07: Permission modes
│       └── git.live.e2e.ts    # E2E-06: Git status badge
├── helpers/
│   └── test-utils.ts
└── screenshots/
```

### Pattern 1: Live Fixture Extension
**What:** Extend base test with live-specific setup/teardown
**When to use:** All live E2E tests
**Example:**
```typescript
// Source: apps/electron/e2e/fixtures/live.fixture.ts (existing)
import { test as base, _electron as electron } from '@playwright/test'
import { homedir } from 'os'

const DEMO_CONFIG_DIR = path.join(homedir(), '.kata-agents-demo')

export const test = base.extend<LiveFixtures>({
  electronApp: async ({}, use) => {
    // Ensure demo environment exists
    execSync('bun run scripts/setup-demo.ts', { cwd: PROJECT_ROOT })
    execSync('bash scripts/create-demo-repo.sh', { cwd: PROJECT_ROOT })

    const app = await electron.launch({
      args: [path.join(__dirname, '../../dist/main.cjs')],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        KATA_CONFIG_DIR: DEMO_CONFIG_DIR,
        // No KATA_TEST_MODE -- real auth path
      },
      timeout: 30_000,
    })

    await use(app)
    await app.close()
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    // Wait for splash screen with extended timeout for live tests
    await window.waitForTimeout(2000)
    await use(window)
  },
})
```

### Pattern 2: Page Object Model with Live Helpers
**What:** Encapsulate UI interactions in reusable classes
**When to use:** All test interactions with UI elements
**Example:**
```typescript
// Source: Playwright POM docs + existing ChatPage.ts
export class ChatPage {
  readonly page: Page
  readonly chatInput: Locator
  readonly sendButton: Locator

  constructor(page: Page) {
    this.page = page
    this.chatInput = page.locator('[contenteditable="true"]').first()
    this.sendButton = page.locator('button').filter({ has: page.locator('svg') }).last()
  }

  async sendMessage(text: string): Promise<void> {
    await this.chatInput.click()
    await this.chatInput.pressSequentially(text, { delay: 10 })
    await this.page.keyboard.press('Enter')
  }

  async waitForResponse(timeout = 30000): Promise<void> {
    // Live tests need longer timeouts for real API calls
    await this.assistantTurns.last().waitFor({ state: 'visible', timeout })
  }

  async cyclePermissionMode(): Promise<void> {
    await this.page.keyboard.press('Shift+Tab')
  }

  async getPermissionMode(): Promise<string | null> {
    // Permission mode badge with data-tutorial attribute
    const badge = this.page.locator('[data-tutorial="permission-mode-dropdown"]')
    return badge.textContent()
  }
}
```

### Pattern 3: Reliable Selectors with data-testid
**What:** Use data-testid attributes for stable element selection
**When to use:** Any UI element that tests need to interact with
**Example:**
```typescript
// In component: apps/electron/src/renderer/components/...
<button data-testid="git-branch-badge" ...>
  {branchName}
</button>

// In test:
const gitBadge = mainWindow.locator('[data-testid="git-branch-badge"]')
await expect(gitBadge).toBeVisible()
await expect(gitBadge).toHaveText(/main/)
```

### Anti-Patterns to Avoid
- **Relying on CSS class selectors:** Classes change with UI redesigns; use `data-testid` or semantic selectors
- **Hardcoded sleep/wait:** Use Playwright's auto-waiting or explicit `waitFor` conditions
- **Shared state between tests:** Each test should work independently; use fixtures for setup/teardown
- **Testing implementation details:** Test user-visible behavior, not internal state

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Electron app launch | Custom spawn logic | `_electron.launch()` | Handles CDP connection, window detection, cleanup |
| Element waiting | setTimeout loops | Playwright auto-waiting + `waitFor` | Built-in retry, timeout handling, better diagnostics |
| Screenshots on failure | Manual try/catch | Playwright reporter config | Automatic, includes videos and traces |
| Test data cleanup | Manual teardown | Playwright fixtures with teardown | Guaranteed cleanup even on test failure |
| Parallel test isolation | Shared state + locks | Separate browser contexts | Playwright provides isolation by default |

**Key insight:** Playwright's fixture system handles setup/teardown, isolation, and cleanup automatically. The demo environment (`~/.kata-agents-demo/`) is persistent by design for live tests - don't add cleanup that would wipe it.

## Common Pitfalls

### Pitfall 1: Insufficient Timeouts for Live API Calls
**What goes wrong:** Tests timeout waiting for Claude API responses
**Why it happens:** Default Playwright timeout (30s) may not be enough for streaming responses
**How to avoid:** Set explicit longer timeouts for live test operations
**Warning signs:** Intermittent timeout failures in CI or slow network conditions
```typescript
// Bad: Uses default timeout
await chatPage.waitForResponse()

// Good: Explicit extended timeout for live tests
await chatPage.waitForResponse({ timeout: 60_000 })
```

### Pitfall 2: Missing Demo Environment Prerequisites
**What goes wrong:** Live tests fail because `~/.kata-agents-demo/` doesn't exist or is stale
**Why it happens:** Developer didn't run `bun run demo:setup` or credentials expired
**How to avoid:** Live fixture already runs setup scripts; add credential validation
**Warning signs:** "No credentials found" errors, onboarding wizard appears
```typescript
// live.fixture.ts already handles this:
execSync('bun run scripts/setup-demo.ts', { cwd: PROJECT_ROOT })
execSync('bash scripts/create-demo-repo.sh', { cwd: PROJECT_ROOT })
```

### Pitfall 3: Flaky Selectors from UI Changes
**What goes wrong:** Tests break when UI is redesigned
**Why it happens:** Using CSS class or structure-based selectors
**How to avoid:** Add `data-testid` attributes to testable elements; use semantic selectors (`getByRole`, `getByText`)
**Warning signs:** Tests fail after UI-only changes, selectors like `[class*="message"]`

### Pitfall 4: Not Waiting for Async State
**What goes wrong:** Test assertions run before state updates complete
**Why it happens:** Electron IPC, React state updates, and API responses are async
**How to avoid:** Use Playwright's expect with auto-retry or explicit waitFor conditions
**Warning signs:** Tests pass locally but fail in CI, assertions on stale values
```typescript
// Bad: Immediate assertion
const mode = await chatPage.getPermissionMode()
expect(mode).toBe('Explore')

// Good: Wait for expected state
await expect(chatPage.page.locator('[data-tutorial="permission-mode-dropdown"]'))
  .toContainText('Explore')
```

### Pitfall 5: Splash Screen Race Condition
**What goes wrong:** Tests start before app is fully loaded
**Why it happens:** Splash screen has fade animation; content not ready
**How to avoid:** Wait for splash screen to disappear (existing fixture does this)
**Warning signs:** "Element not found" errors on first interaction

## Code Examples

Verified patterns from official sources and existing codebase:

### Live Auth Test (E2E-03)
```typescript
// Source: Existing patterns + Playwright docs
import { test, expect } from '../fixtures/live.fixture'

test.describe('Live Auth', () => {
  test('E2E-03: app loads with real credentials, no onboarding wizard', async ({ mainWindow }) => {
    // Wait for app to fully initialize
    await mainWindow.waitForLoadState('networkidle')

    // Verify no onboarding wizard appears
    const onboardingWizard = mainWindow.getByRole('heading', { name: /welcome|get started/i })
    await expect(onboardingWizard).not.toBeVisible({ timeout: 5000 })

    // Verify main app container is visible
    await expect(mainWindow.locator('[data-testid="app-container"]')).toBeVisible()

    // Verify chat input is available (indicates successful auth)
    await expect(mainWindow.locator('[contenteditable="true"]')).toBeVisible()
  })
})
```

### Live Chat Round-Trip (E2E-04)
```typescript
// Source: Existing ChatPage.ts + Playwright docs
import { test, expect } from '../fixtures/live.fixture'
import { ChatPage } from '../page-objects/ChatPage'

test.describe('Live Chat', () => {
  test('E2E-04: send message, verify streaming response renders', async ({ mainWindow }) => {
    const chatPage = new ChatPage(mainWindow)
    await chatPage.waitForReady()

    // Send a simple message
    await chatPage.sendMessage('Say hello in exactly 5 words')

    // Wait for streaming response with extended timeout
    await chatPage.waitForResponse({ timeout: 60_000 })

    // Verify turn cards rendered
    const assistantMessage = await chatPage.getLastAssistantMessage()
    expect(assistantMessage).toBeTruthy()
    expect(assistantMessage?.length).toBeGreaterThan(0)
  })
})
```

### Session Lifecycle (E2E-05)
```typescript
// Source: Pattern from session-lifecycle.e2e.ts + requirements
import { test, expect } from '../fixtures/live.fixture'

test.describe('Live Session Lifecycle', () => {
  test('E2E-05: create, rename, switch, delete sessions', async ({ mainWindow }) => {
    // Create new session
    const newChatButton = mainWindow.getByRole('button', { name: /new chat/i })
    await newChatButton.click()

    // Verify new session created (chat input visible)
    await expect(mainWindow.locator('[contenteditable="true"]')).toBeVisible()

    // Session rename would be tested via context menu or header edit
    // Switch sessions via session list
    // Delete session via context menu
    // Persistence verification: restart app, verify sessions persist
  })
})
```

### Permission Mode Cycling (E2E-07)
```typescript
// Source: ChatPage.ts + mode-types.ts
import { test, expect } from '../fixtures/live.fixture'
import { ChatPage } from '../page-objects/ChatPage'

test.describe('Live Permission Modes', () => {
  test('E2E-07: cycle through permission modes with SHIFT+TAB', async ({ mainWindow }) => {
    const chatPage = new ChatPage(mainWindow)
    await chatPage.waitForReady()

    // Get initial mode (default is 'ask')
    const modeBadge = mainWindow.locator('[data-tutorial="permission-mode-dropdown"]')
    await expect(modeBadge).toContainText('Ask')

    // Cycle to allow-all
    await chatPage.cyclePermissionMode()
    await expect(modeBadge).toContainText('Execute')

    // Cycle to safe
    await chatPage.cyclePermissionMode()
    await expect(modeBadge).toContainText('Explore')

    // Cycle back to ask
    await chatPage.cyclePermissionMode()
    await expect(modeBadge).toContainText('Ask')
  })
})
```

### Git Status Badge (E2E-06)
```typescript
// Source: git-status.e2e.ts + requirements
import { test, expect } from '../fixtures/live.fixture'

test.describe('Live Git Status', () => {
  test('E2E-06: git badge shows correct branch in demo repo', async ({ mainWindow }) => {
    // Demo repo is initialized with 'main' branch
    // Wait for git status to be fetched
    await mainWindow.waitForTimeout(2000)

    // Git badge should show 'main' branch
    const gitBadge = mainWindow.locator('[data-testid="git-branch-badge"]')
    await expect(gitBadge).toBeVisible()
    await expect(gitBadge).toContainText('main')
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spectron | Playwright with `_electron` | 2022 (Spectron deprecated) | Spectron only supports Electron v13, Playwright supports v12.2+, v13.4+, v14+ |
| CSS class selectors | `data-testid` + semantic selectors | Best practice evolution | More stable tests, survives UI redesigns |
| Manual setup scripts | Playwright fixtures with auto setup | Built-in since Playwright 1.18 | Guaranteed cleanup, better isolation |

**Deprecated/outdated:**
- **Spectron:** No longer maintained; doesn't support Electron v14+
- **WebDriver-based testing:** CDP (Chrome DevTools Protocol) is faster and more reliable for Electron

## Open Questions

Things that couldn't be fully resolved:

1. **Streaming response detection**
   - What we know: Claude responses stream via agent SDK events
   - What's unclear: Exact DOM mutations to wait for during streaming
   - Recommendation: Test for final turn card presence with extended timeout; may need to add `data-testid="turn-card-final"` marker

2. **Session persistence verification**
   - What we know: Sessions stored as JSONL in `~/.kata-agents-demo/workspaces/demo-workspace/sessions/`
   - What's unclear: Whether to verify persistence by restarting app or by reading files directly
   - Recommendation: Use app restart approach for true E2E verification; file check as fallback

3. **Demo repo git branch modification**
   - What we know: Demo repo created with 'main' branch
   - What's unclear: Whether tests should create/switch branches or just verify existing
   - Recommendation: Start with verifying existing branch; branch operations are lower priority

## Sources

### Primary (HIGH confidence)
- apps/electron/e2e/README.md - Existing E2E documentation
- apps/electron/e2e/fixtures/live.fixture.ts - Live fixture implementation
- apps/electron/e2e/page-objects/*.ts - Page object patterns
- packages/shared/src/agent/mode-types.ts - Permission mode definitions
- scripts/setup-demo.ts - Demo environment setup
- [Playwright Electron Docs](https://playwright.dev/docs/api/class-electron) - Official Electron API

### Secondary (MEDIUM confidence)
- [BrowserStack Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices) - Industry patterns
- [Playwright POM Docs](https://playwright.dev/docs/pom) - Official Page Object guidance
- [Playwright Fixtures Docs](https://playwright.dev/docs/test-fixtures) - Official fixture patterns

### Tertiary (LOW confidence)
- Web search results for live credential testing patterns - General guidance, not Electron-specific

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Project already uses Playwright; documented and working
- Architecture: HIGH - Existing patterns in codebase; Playwright docs verify approach
- Pitfalls: MEDIUM - Some based on common patterns, not project-specific experience

**Research date:** 2026-02-04
**Valid until:** 2026-03-04 (30 days - stable tooling)
