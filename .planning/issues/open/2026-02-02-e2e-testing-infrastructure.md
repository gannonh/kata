---
created: 2026-02-02T16:45
title: E2E Testing Infrastructure - Mock API & Feature Integration Tests
area: testing
provenance: github:gannonh/kata-agents#49
files:
  - apps/electron/e2e/fixtures/electron.fixture.ts
  - apps/electron/e2e/tests/git-status.e2e.ts
  - apps/electron/e2e/tests/app-launch.e2e.ts
  - apps/electron/src/main/onboarding.ts
---

## Problem

Current E2E tests are smoke tests only - they verify the app launches and basic UI renders, but don't test actual feature functionality:

1. **No chat interaction testing** - Can't test sending messages, receiving responses, or conversation flow without hitting real Claude API
2. **No skill testing** - Skills require agent execution which requires API
3. **No MCP testing** - MCP server connections need mock servers
4. **Git status badge test is trivial** - Only verifies badge is NOT visible in non-git directory (default state), doesn't test that it SHOWS correctly in git repos
5. **No session lifecycle testing** - Create, rename, delete, switch sessions
6. **No workspace switching tests** - Multi-workspace scenarios

The onboarding bypass (KATA_TEST_MODE=1) was added to allow tests to reach the main UI, but the tests don't exercise real functionality.

## Solution

Build comprehensive E2E testing infrastructure:

### Phase 1: Mock API Server
- Create a local mock server that returns canned Claude API responses
- Configure app to use mock server via ANTHROPIC_BASE_URL in test mode
- Enable testing full chat flow: send message → process → display response

### Phase 2: Git Integration Tests
- Create test fixtures that initialize real git repos in temp directories
- Test git badge shows correct branch name
- Test dirty status indicators
- Test branch switching detection

### Phase 3: MCP Mock Servers
- Create stdio-based mock MCP servers for testing
- Test MCP tool discovery and execution
- Test MCP error handling

### Phase 4: Skill Testing
- Pre-configure test workspace with sample skills
- Test skill invocation and execution flow
- Test skill error handling

### Phase 5: Session/Workspace Tests
- Test session CRUD operations
- Test workspace switching
- Test data isolation between workspaces

### Infrastructure Needs
- Test data factory functions for creating fixtures
- Cleanup utilities for test isolation
- CI-compatible mock servers (no external dependencies)
