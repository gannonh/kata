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

describe('kata-debugging-kata-workflow-issues skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-debugging-kata-workflow-issues skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-debugging-kata-workflow-issues');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-debugging-kata-workflow-issues');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('DEBUG-KATA operation', () => {
    it('triggers skill on "plan failed" prompt', async () => {
      const result = invokeClaude('plan failed', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'DEBUG-KATA operation should invoke skill workflow');
    });

    it('triggers skill on "kata isn\'t working" prompt', async () => {
      const result = invokeClaude("kata isn't working", {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Natural language should trigger skill');
    });

    it('triggers skill on "execution stuck" prompt', async () => {
      const result = invokeClaude('execution stuck', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Execution stuck should trigger DEBUG-KATA operation');
    });
  });
});
