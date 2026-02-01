import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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

describe('kata-set-profile', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-set-profile-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Create a config.json file to simulate active project
    const configContent = {
      mode: 'yolo',
      depth: 'standard',
      parallelization: true,
      model_profile: 'balanced'
    };
    writeFileSync(
      join(testDir, '.planning', 'config.json'),
      JSON.stringify(configContent, null, 2)
    );

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-set-profile');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-set-profile');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "set profile to quick" prompt', async () => {
    const result = invokeClaude('set profile to budget', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-set-profile skill to be invoked');
  });

  it('profile affects execution', async () => {
    const result = invokeClaude('switch to quality profile', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);

    // Verify result mentions profile options
    assertResultContains(
      result,
      /profile|quality|balanced|budget|model/i,
      'Expected result to mention profile options'
    );
  });
});
