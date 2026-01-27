/**
 * Tests for kata-reviewing-pull-requests skill
 *
 * This skill runs specialized code review agents to analyze PR quality.
 * Tests verify skill triggers on natural language prompts.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import { assertSkillInvoked, assertNoError } from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-reviewing-pull-requests skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-reviewing-pull-requests');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-reviewing-pull-requests');
    cpSync(skillSource, skillDest, { recursive: true });

    // Install review agents spawned by the skill
    const agents = [
      'kata-code-reviewer.md',
      'kata-code-simplifier.md',
      'kata-comment-analyzer.md',
      'kata-pr-test-analyzer.md',
      'kata-silent-failure-hunter.md',
      'kata-type-design-analyzer.md'
    ];
    for (const agent of agents) {
      cpSync(
        join(KATA_ROOT, 'agents', agent),
        join(testDir, '.claude', 'agents', agent)
      );
    }
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('triggers on "review my PR" prompt', () => {
    const result = invokeClaude('review my PR', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('triggers on "run code review" prompt', () => {
    const result = invokeClaude('run code review', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });
});
