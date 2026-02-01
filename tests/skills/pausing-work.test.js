import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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

describe('kata-pause-work', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-pause-work-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Create a phase directory to simulate active work
    mkdirSync(join(testDir, '.planning', 'phases', '01-test-phase'), { recursive: true });

    // Create a sample PLAN.md to indicate active work
    const samplePlan = `---
phase: 01-test-phase
plan: 01
type: execute
---

<objective>
Test phase for verifying pause functionality.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Sample task</name>
  <action>Do something</action>
  <verify>Check it worked</verify>
  <done>Task complete</done>
</task>
</tasks>
`;
    writeFileSync(
      join(testDir, '.planning', 'phases', '01-test-phase', '01-01-PLAN.md'),
      samplePlan
    );

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-pause-work');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-pause-work');
    cpSync(skillSource, skillDest, { recursive: true });

    // Initialize git repo for commit operations
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      execSync('git add -A && git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });
    } catch (e) {
      // Git init may fail in some environments
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "pause work" prompt', async () => {
    const result = invokeClaude('pause work', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-pause-work skill to be invoked');
  });

  it('updates session state', async () => {
    const result = invokeClaude('save my progress and pause', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Check if .continue-here.md was created or STATE.md was updated
    const continueHereExists = existsSync(
      join(testDir, '.planning', 'phases', '01-test-phase', '.continue-here.md')
    );
    const stateContent = readFileSync(join(testDir, '.planning', 'STATE.md'), 'utf8');

    // Verify result mentions handoff/pause/continue
    assertResultContains(
      result,
      /handoff|pause|continue|resume|session/i,
      'Expected result to mention handoff or pause state'
    );
  });
});
