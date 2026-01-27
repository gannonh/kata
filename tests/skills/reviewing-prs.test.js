/**
 * Tests for kata-reviewing-prs skill
 *
 * This skill provides comprehensive PR review using specialized agents
 * covering code quality, test coverage, error handling, type design,
 * comment accuracy, and code simplification.
 */

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

describe('kata-reviewing-prs skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-reviewing-prs');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-reviewing-prs');
    cpSync(skillSource, skillDest, { recursive: true });

    // Create a sample file with changes for the skill to review
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'example.js'), `
function add(a, b) {
  return a + b;
}

module.exports = { add };
`);
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "review my code" prompt', () => {
    const result = invokeClaude('review my code', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('responds to "check code quality" prompt', () => {
    const result = invokeClaude('check code quality', {
      cwd: testDir,
      maxBudget: config.budgets.standard,
      timeout: config.timeouts.standard
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('lists review aspects when asked about PR review', () => {
    const result = invokeClaude('what can you review in my PR?', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    // The skill should mention review aspects
    assertResultContains(result, /code|tests|errors|types|comments|simplify/i);
  });
});
