import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists,
  assertFileMatchesPattern
} from '../harness/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');

// Path to Kata repo root (for skill installation)
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-manageing-milestones skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-manageing-milestones skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-manageing-milestones');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-manageing-milestones');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('NEW operation', () => {
    it('triggers skill on "new milestone" prompt', async () => {
      const result = invokeClaude('new milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'NEW operation should invoke skill workflow');
    });

    it('triggers skill on "create milestone" prompt', async () => {
      const result = invokeClaude('create milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Create milestone should trigger NEW operation');
    });

    it('triggers skill on "start milestone" prompt', async () => {
      const result = invokeClaude('start milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Start milestone should trigger NEW operation');
    });
  });

  describe('COMPLETE operation', () => {
    it('triggers skill on "complete milestone" prompt', async () => {
      const result = invokeClaude('complete milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'COMPLETE operation should invoke skill workflow');
    });

    it('triggers skill on "finish milestone" prompt', async () => {
      const result = invokeClaude('finish milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Finish milestone should trigger COMPLETE operation');
    });
  });

  describe('AUDIT operation', () => {
    it('triggers skill on "audit milestone" prompt', async () => {
      const result = invokeClaude('audit milestone', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'AUDIT operation should invoke skill workflow');
    });

    it('triggers skill on "check milestone coverage" prompt', async () => {
      const result = invokeClaude('check milestone coverage', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Check coverage should trigger AUDIT operation');
    });
  });
});
