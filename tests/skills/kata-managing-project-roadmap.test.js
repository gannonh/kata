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

describe('kata-managing-project-roadmap skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-managing-project-roadmap skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-managing-project-roadmap');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-managing-project-roadmap');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('ADD operation', () => {
    it('triggers skill on "add a phase to the roadmap" prompt', async () => {
      const result = invokeClaude('add a phase to the roadmap for user authentication', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'ADD operation should invoke skill workflow');
    });

    it('triggers skill on "I need a new phase" prompt', async () => {
      const result = invokeClaude('I need a new phase for testing', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Natural language should trigger skill');
    });
  });

  describe('INSERT operation', () => {
    it('triggers skill on "insert urgent phase" prompt', async () => {
      const result = invokeClaude('insert urgent phase for security hotfix between phase 1 and 2', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'INSERT operation should invoke skill workflow');
    });
  });
});
