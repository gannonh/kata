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

describe('kata-verifying-work-outcomes-and-user-acceptance-testing skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-verifying-work-outcomes-and-user-acceptance-testing skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-verifying-work-outcomes-and-user-acceptance-testing');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-verifying-work-outcomes-and-user-acceptance-testing');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('UAT operation', () => {
    it('triggers skill on "run kata uat" prompt', async () => {
      // Note: use "kata uat" to avoid triggering test suite runner
      const result = invokeClaude('run kata uat', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'UAT prompt should invoke verification workflow');
    });
  });

  describe('Goal-backward verification', () => {
    it('triggers skill on "verify phase 1" prompt', async () => {
      const result = invokeClaude('verify phase 1', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Verify phase prompt should invoke goal-backward verification');
    });

    it('triggers skill on "did it work" prompt', async () => {
      const result = invokeClaude('did it work', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Did it work prompt should invoke verification workflow');
    });
  });
});
