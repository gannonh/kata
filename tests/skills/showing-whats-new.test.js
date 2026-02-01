/**
 * Tests for kata-whats-new skill
 *
 * This skill displays changes between installed version and latest available version.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

describe('kata-whats-new skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-whats-new');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-whats-new');
    cpSync(skillSource, skillDest, { recursive: true });

    // Create a VERSION file for the skill to read
    const kataDir = join(testDir, '.claude', 'kata');
    mkdirSync(kataDir, { recursive: true });
    writeFileSync(join(kataDir, 'VERSION'), '1.0.0\n');
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "what\'s new" prompt', () => {
    const result = invokeClaude("what's new in kata", {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('shows version information', () => {
    const result = invokeClaude('show kata changes', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    // The skill should mention version or installed version status
    assertResultContains(result, /version|installed|1\.0\.0/i);
  });
});
