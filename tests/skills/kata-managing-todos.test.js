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

describe('kata-managing-todos skill', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test directory
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));

    // Copy fixture project
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install kata-managing-todos skill to test project
    const skillSource = join(KATA_ROOT, 'skills', 'kata-managing-todos');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-managing-todos');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    // Cleanup test directory
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('CHECK operation', () => {
    it('triggers skill on "check my todos" prompt', async () => {
      const result = invokeClaude('check my todos', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000  // 3 min for skill execution
      });

      assertNoError(result);
      assertSkillInvoked(result, 'CHECK operation should invoke skill workflow');
    });

    it('triggers skill on "what todos do I have" prompt', async () => {
      const result = invokeClaude('what todos do I have', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'Natural language should trigger skill');
    });
  });

  describe('ADD operation', () => {
    it('creates todo file on "add todo" prompt', async () => {
      const result = invokeClaude('add todo: implement user authentication', {
        cwd: testDir,
        maxBudget: 2.00,
        timeout: 180000
      });

      assertNoError(result);
      assertSkillInvoked(result, 'ADD operation should invoke skill workflow');

      // Verify todo file was created
      const todosDir = join(testDir, '.planning', 'todos', 'pending');
      assertFileMatchesPattern(
        todosDir,
        /.*authentication.*\.md$/i,
        'Todo file should be created with slug from title'
      );
    });
  });
});
