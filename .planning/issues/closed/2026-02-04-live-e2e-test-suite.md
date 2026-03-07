---
created: 2026-02-04T15:30
title: Live E2E Test Suite - Comprehensive Tests with Real Credentials
area: testing
provenance: github:gannonh/kata-agents#60
linked_phase: 1
files:
  - apps/electron/e2e/fixtures/live.fixture.ts
  - apps/electron/e2e/fixtures/electron.fixture.ts
  - apps/electron/e2e/tests/app-launch.e2e.ts
  - apps/electron/e2e/tests/session-lifecycle.e2e.ts
  - apps/electron/e2e/page-objects/ChatPage.ts
  - scripts/setup-demo.ts
  - scripts/create-demo-repo.sh
---

## Problem

Current e2e tests are smoke tests that verify app launch and basic UI rendering under `KATA_TEST_MODE=1` with no real authentication. They catch build failures but miss functional regressions that only surface with a real authenticated session: chat flow, session management, MCP connections, skill invocation, git status in real repos.

The `live.fixture.ts` infrastructure now exists (uses `~/.kata-agents-demo/` with real OAuth credentials), but no live test specs have been written yet.

Certain categories of regressions can only be caught by testing against a real build with a real account:

- Auth token refresh and session persistence across app restart
- Chat round-trip: send message, receive streaming response, verify rendering
- Session CRUD with real persistence (create, rename, delete, switch)
- MCP server lifecycle with real stdio connections
- Git status badge in real git repos (branch name, dirty state)
- Skill invocation triggering real agent execution
- Workspace switching with real config loading

## Solution

### Two-tier e2e strategy

**Tier 1: CI smoke tests (existing, keep as-is)**
- Headless, `KATA_TEST_MODE=1`, mocked
- Fast, no credentials needed
- Validates app launches, basic UI renders, no console errors
- Runs on every PR via GitHub Actions

**Tier 2: Live integration tests (new)**
- Uses `live.fixture.ts` with `~/.kata-agents-demo/` environment
- Real OAuth credentials from `~/.kata-agents/credentials.enc`
- Run locally, headless or headed (`bun run test:e2e:live` / `bun run test:e2e:live:ui`)
- Longer timeouts for real API calls
- Tests organized by feature area

### Live test specs to write

1. **Auth & session bootstrap** — App loads with real credentials, no onboarding wizard, session list populates from demo workspace
2. **Chat round-trip** — Send a message, verify streaming response renders, verify turn card structure
3. **Session lifecycle** — Create new session, rename it, switch between sessions, delete a session, verify persistence after app restart
4. **Git status** — Launch with demo repo as working directory, verify branch badge shows correct branch, verify dirty indicator after modifying a tracked file
5. **MCP server connection** — Connect to filesystem MCP source in demo workspace, verify tool list populates
6. **Permission modes** — Cycle through safe/ask/allow-all, verify mode indicator updates, verify tool approval behavior changes
7. **Workspace switching** — Switch between workspaces, verify session list updates, verify config isolation

### Infrastructure additions

- `bun run test:e2e:live` script in `apps/electron/package.json` (runs only live specs)
- `bun run test:e2e:live:ui` for headed/interactive mode
- Separate Playwright project or tag (`@live`) to distinguish from CI smoke tests
- Page objects extended with methods for chat interaction, session management
- Test helpers for waiting on streaming responses with appropriate timeouts

### Relates to

- `.planning/issues/open/2026-02-02-e2e-testing-infrastructure.md` — complementary; that issue covers mock-based CI tests, this covers live local tests
