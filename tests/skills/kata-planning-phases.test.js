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

describe('kata-planning-phases skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-planning-phases skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-planning-phases');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-planning-phases');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('planning workflow', () => {
    it('triggers skill on "plan phase 1" prompt', async () => {
      const result = invokeClaude('plan phase 1', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Phase planning should invoke skill workflow');
    });

    it('triggers skill on "create plan for phase 1" prompt', async () => {
      const result = invokeClaude('create plan for phase 1', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Natural language should trigger skill');
    });

    it('triggers skill on "task breakdown for phase 1" prompt', async () => {
      const result = invokeClaude('task breakdown for phase 1', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Task breakdown trigger should invoke skill workflow');
    });
  });
});
