import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertResultContains
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-resume-work', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-resume-work-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Create a phase directory with paused state
    mkdirSync(join(testDir, '.planning', 'phases', '01-test-phase'), { recursive: true });

    // Create a .continue-here.md to simulate paused state
    const continueHere = `---
phase: 01-test-phase
task: 2
total_tasks: 3
status: in_progress
last_updated: 2026-01-25T10:00:00Z
---

<current_state>
Working on implementing authentication flow.
</current_state>

<completed_work>
- Task 1: Set up project structure - Done
- Task 2: Implement login endpoint - In progress, API route created
</completed_work>

<remaining_work>
- Task 2: Add password validation
- Task 3: Implement logout endpoint
</remaining_work>

<decisions_made>
- Decided to use JWT tokens for session management
</decisions_made>

<blockers>
None.
</blockers>

<context>
Focus on completing the login validation before moving to logout.
</context>

<next_action>
Start with: Add bcrypt password comparison in login route handler.
</next_action>
`;
    writeFileSync(
      join(testDir, '.planning', 'phases', '01-test-phase', '.continue-here.md'),
      continueHere
    );

    // Update STATE.md to indicate paused session
    const stateContent = `# Project State

## Project Reference

**Core value:** Test project for Kata skill verification
**Current focus:** Phase 1 - Authentication

## Current Position

Milestone: Test
Phase: 1 (Authentication)
Plan: 01 of 03
Status: Paused
Last activity: 2026-01-25 - Paused at task 2

## Session Continuity

Last session: 2026-01-25
Stopped at: Phase 1, Task 2
Resume file: .planning/phases/01-test-phase/.continue-here.md
`;
    writeFileSync(join(testDir, '.planning', 'STATE.md'), stateContent);

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-resume-work');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-resume-work');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "resume work" prompt', async () => {
    const result = invokeClaude('resume work', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-resume-work skill to be invoked');
  });

  it('reads previous session context', async () => {
    const result = invokeClaude('pick up where I left off', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Verify result references session context or continuity
    assertResultContains(
      result,
      /session|resume|continue|authentication|login|task|phase/i,
      'Expected result to reference session context'
    );
  });
});
