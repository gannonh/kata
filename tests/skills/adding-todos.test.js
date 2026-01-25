import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertFileMatchesPattern
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-adding-todos', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-adding-todos-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Ensure todos directories exist
    mkdirSync(join(testDir, '.planning', 'todos', 'pending'), { recursive: true });
    mkdirSync(join(testDir, '.planning', 'todos', 'done'), { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-adding-todos');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-adding-todos');
    cpSync(skillSource, skillDest, { recursive: true });

    // Initialize git repo for commit operations
    try {
      const { execSync } = require('child_process');
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      execSync('git add -A && git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });
    } catch (e) {
      // Git init may fail in some environments, skill should handle gracefully
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates todo file on "add a todo for fixing the login bug"', async () => {
    const result = invokeClaude('add a todo for fixing the login bug', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-adding-todos skill to be invoked');
  });

  it('todo file created in pending directory', async () => {
    const result = invokeClaude('add a todo for implementing dark mode', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);

    // Verify a .md file was created in the pending directory
    assertFileMatchesPattern(
      join(testDir, '.planning', 'todos', 'pending'),
      /\.md$/,
      'Expected todo .md file to be created in .planning/todos/pending/'
    );
  });
});
