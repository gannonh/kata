/**
 * Tests for kata-reviewing-pull-requests skill
 *
 * This skill runs specialized code review agents to analyze PR quality.
 * Tests verify skill triggers on natural language prompts.
 *
 * Note: Agent behavior is tested separately. These tests verify
 * the skill activates correctly and contains required references.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
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
      'kata-failure-finder.md',
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

describe('kata-reviewing-pull-requests skill structure', () => {
  const skillPath = join(KATA_ROOT, 'skills', 'kata-reviewing-pull-requests', 'SKILL.md');
  let skillContent;

  beforeEach(() => {
    skillContent = readFileSync(skillPath, 'utf8');
  });

  it('references all 6 review agents', () => {
    const agents = [
      'kata-code-reviewer',
      'kata-code-simplifier',
      'kata-comment-analyzer',
      'kata-pr-test-analyzer',
      'kata-failure-finder',
      'kata-type-design-analyzer'
    ];
    for (const agent of agents) {
      assert.ok(
        skillContent.includes(agent),
        `Missing reference to ${agent}`
      );
    }
  });

  it('documents all review aspects', () => {
    const aspects = ['comments', 'tests', 'errors', 'types', 'code', 'simplify', 'all'];
    for (const aspect of aspects) {
      assert.ok(
        skillContent.includes(`**${aspect}**`),
        `Missing aspect: ${aspect}`
      );
    }
  });

  it('includes error handling guidance', () => {
    assert.ok(
      skillContent.includes('Error handling:') || skillContent.includes('**Error handling:**'),
      'Missing error handling guidance section'
    );
    assert.ok(
      skillContent.includes('git diff') && skillContent.includes('fails'),
      'Missing git command error handling'
    );
  });

  it('includes agent failure handling', () => {
    assert.ok(
      skillContent.includes('Agent failure handling:') || skillContent.includes('**Agent failure handling:**'),
      'Missing agent failure handling section'
    );
    assert.ok(
      skillContent.includes('times out') || skillContent.includes('timed out'),
      'Missing timeout handling guidance'
    );
  });

  it('documents both sequential and parallel approaches', () => {
    assert.ok(
      skillContent.includes('Sequential approach'),
      'Missing sequential approach documentation'
    );
    assert.ok(
      skillContent.includes('Parallel approach'),
      'Missing parallel approach documentation'
    );
  });

  it('includes result aggregation with severity levels', () => {
    const severities = ['Critical Issues', 'Important Issues', 'Suggestions'];
    for (const severity of severities) {
      assert.ok(
        skillContent.includes(severity),
        `Missing severity level: ${severity}`
      );
    }
  });
});
