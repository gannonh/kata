/**
 * Tests for kata-tracking-progress skill
 *
 * This skill checks project progress, summarizes recent work,
 * and intelligently routes to the next action.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
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

describe('kata-tracking-progress skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-tracking-progress');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-tracking-progress');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "what\'s the status" prompt', () => {
    const result = invokeClaude("what's the status", {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result);
  });

  it('shows project state information', () => {
    const result = invokeClaude('check progress', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    // The fixture STATE.md contains "Milestone" and "Phase" keywords
    // The skill should read and display this information
    assertResultContains(result, /Milestone|Phase|Progress|Fixture/i);
  });

  describe('PR Status Display - Phase 5', () => {
    it('contains pr_workflow config check', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-tracking-progress', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasPRWorkflowCheck = skillContent.includes('pr_workflow') ||
                                  skillContent.includes('PR_WORKFLOW');

      if (!hasPRWorkflowCheck) {
        throw new Error('Expected skill to check pr_workflow config');
      }
    });

    it('contains PR status section', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-tracking-progress', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasPRStatus = skillContent.includes('PR Status') ||
                          skillContent.includes('PR #');

      if (!hasPRStatus) {
        throw new Error('Expected skill to display PR status');
      }
    });

    it('uses gh pr commands for status', () => {
      const skillPath = join(testDir, '.claude', 'skills', 'kata-tracking-progress', 'SKILL.md');
      const skillContent = readFileSync(skillPath, 'utf8');

      const hasGHPR = skillContent.includes('gh pr');

      if (!hasGHPR) {
        throw new Error('Expected skill to use gh pr commands for status');
      }
    });
  });
});
