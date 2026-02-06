import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-discuss-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), config.isolation.tempPrefix));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-discuss-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-discuss-phase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Ensure .claude directory structure exists
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });

    // Set up ROADMAP.md with Phase 1 that has a goal
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Current Milestone: v1.0 Foundation

### Phase 1: User Authentication

**Goal:** Implement user login, registration, and session management
**Depends on:** None
**Plans:** 0 plans

Plans:
- [ ] TBD (run /kata-plan-phase 1 to break down)

**Details:**
Users should be able to register, login, logout, and manage their sessions.

---

## Progress

| Phase | Name | Status |
|-------|------|--------|
| 1 | User Authentication | Not started |
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase 1 directory
    mkdirSync(join(testDir, '.planning', 'phases', '01-user-authentication'), { recursive: true });

    // Set up STATE.md
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Current Position

Phase: 1 of 1
Plan: Not started
Status: Ready to discuss
Last activity: Test setup

Progress: [                                ] 0%
`;
    writeFileSync(statePath, stateContent);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "discuss phase 1"', async () => {
    const result = invokeClaude('discuss phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('creates CONTEXT.md or mentions context/decisions', async () => {
    const result = invokeClaude('discuss phase 1 - the auth should use JWT tokens', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Check if CONTEXT.md was created or if output mentions context/decisions
    const phaseDir = join(testDir, '.planning', 'phases', '01-user-authentication');
    const contextPath = join(phaseDir, '01-CONTEXT.md');

    const contextCreated = existsSync(contextPath);
    const resultText = result.result || '';

    // The skill should either create CONTEXT.md or present gray areas for discussion
    const mentionsContext = resultText.toLowerCase().includes('context') ||
      resultText.toLowerCase().includes('decision') ||
      resultText.toLowerCase().includes('gray area') ||
      resultText.toLowerCase().includes('discuss');

    if (!contextCreated && !mentionsContext) {
      throw new Error(`Expected CONTEXT.md to be created or discussion of gray areas, got:\n${resultText.substring(0, 500)}`);
    }
  });
});
