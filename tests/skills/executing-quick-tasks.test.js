import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists,
  assertResultContains
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-execute-quick-task', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-quick-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-execute-quick-task');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-execute-quick-task');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install required agents (spawned by skill)
    mkdirSync(join(testDir, '.claude', 'agents'), { recursive: true });
    const agents = ['kata-planner.md', 'kata-executor.md'];
    for (const agent of agents) {
      const agentSource = join(KATA_ROOT, 'agents', agent);
      if (existsSync(agentSource)) {
        cpSync(agentSource, join(testDir, '.claude', 'agents', agent));
      }
    }

    // Ensure .planning/quick/ directory exists for quick task tracking
    mkdirSync(join(testDir, '.planning', 'quick'), { recursive: true });

    // Initialize git repo (required for quick task commits)
    const { execSync } = require('node:child_process');
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      execSync('git add -A && git commit -m "Initial commit"', { cwd: testDir, stdio: 'pipe' });
    } catch (e) {
      // Git might not be available
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "quick task: add a README"', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('quick task: add a README file', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "quick task"');
  });

  it('creates quick task artifacts', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('quick task: create a hello.txt file', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify .planning/quick/ directory has content
    const quickDir = join(testDir, '.planning', 'quick');
    const { readdirSync } = require('node:fs');

    // Either a task directory was created, or result mentions quick task completion
    const quickDirContents = readdirSync(quickDir);
    const hasQuickTaskDir = quickDirContents.some(f => /^\d{3}-/.test(f));
    const resultMentionsComplete = (result.result || '').toLowerCase().includes('complete') ||
      (result.result || '').toLowerCase().includes('quick');

    if (!hasQuickTaskDir && !resultMentionsComplete) {
      throw new Error('Expected .planning/quick/ directory to have task artifacts or result to mention completion');
    }
  });

  it('responds to "quick mode" trigger', { timeout: config.timeouts.standard }, () => {
    const result = invokeClaude('quick mode: add a .gitignore file', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected skill to be invoked for "quick mode"');
  });
});
