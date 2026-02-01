import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertFileMatchesPattern,
  assertResultContains
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-research-phase', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-researching-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-research-phase');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-research-phase');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-phase-researcher.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Set up ROADMAP.md with Phase 1 (research-worthy goal)
    const roadmapPath = join(testDir, '.planning', 'ROADMAP.md');
    const roadmapContent = `# Roadmap: Test Fixture

## Overview

Test project for Kata skill testing.

## Phases

### Phase 01: Implement User Authentication
**Goal:** Build secure user authentication with JWT tokens
**Success criteria:**
- Users can register with email/password
- Users can log in and receive JWT token
- Protected routes validate JWT tokens

## Progress

1 phase planned.
`;
    writeFileSync(roadmapPath, roadmapContent);

    // Create phase directory (empty - no research yet)
    const phaseDir = join(testDir, '.planning', 'phases', '01-implement-user-authentication');
    mkdirSync(phaseDir, { recursive: true });

    // Update STATE.md
    const statePath = join(testDir, '.planning', 'STATE.md');
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for Kata skill verification
**Current focus:** Research Phase 1

## Current Position

Milestone: Test
Phase: 1 (Implement User Authentication)
Plan: 0
Status: Ready for research

## Accumulated Context

### Decisions

None.

### Pending Todos

0 pending todos.

### Blockers/Concerns

None.
`;
    writeFileSync(statePath, stateContent);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "research phase 1"', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('research phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "research phase 1"');
  });

  it('creates RESEARCH.md', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('research phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify RESEARCH.md was created in the phase directory
    const phaseDir = join(testDir, '.planning', 'phases', '01-implement-user-authentication');
    assertFileMatchesPattern(
      phaseDir,
      /RESEARCH\.md$/,
      'Expected RESEARCH.md file to be created in phase directory'
    );
  });

  it('responds to "investigate phase implementation"', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('investigate how to implement phase 1', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "investigate phase implementation"');
  });
});
