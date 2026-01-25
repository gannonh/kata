/**
 * Tests for kata-updating skill.
 *
 * Verifies that the updating skill correctly checks for updates and reports
 * version information. Note: Actual updates require npm/network access, so
 * tests verify the skill triggers and reports status rather than performing
 * actual updates.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import { assertSkillInvoked, assertNoError, assertResultContains } from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-updating skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-updating-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-updating');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-updating');
    cpSync(skillSource, skillDest, { recursive: true });

    // Create kata directory structure with VERSION file
    mkdirSync(join(testDir, '.claude', 'kata'), { recursive: true });
    writeFileSync(join(testDir, '.claude', 'kata', 'VERSION'), '1.0.0');
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "update kata" prompt', () => {
    const result = invokeClaude('update kata', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected updating skill to be invoked for update prompt');
  });

  it('reports version information', () => {
    const result = invokeClaude('check for kata updates', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify result mentions version, update status, or current state
    assertResultContains(
      result,
      /version|update|current|latest|installed/i,
      'Expected result to mention version or update status'
    );
  });
});
