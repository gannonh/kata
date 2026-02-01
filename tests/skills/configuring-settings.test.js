import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import {
  assertSkillInvoked,
  assertNoError,
  assertArtifactExists
} from '../harness/assertions.js';
import { config } from '../harness/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-configure-settings', () => {
  let testDir;

  beforeEach(() => {
    // Create isolated test environment
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-configure-settings-'));
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
    const skillSource = join(KATA_ROOT, 'skills', 'kata-configure-settings');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-configure-settings');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('responds to "configure settings" prompt', async () => {
    const result = invokeClaude('show me the kata settings', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);
    assertSkillInvoked(result, 'Expected kata-configure-settings skill to be invoked');
  });

  it('can read config.json', async () => {
    const result = invokeClaude('what are my current kata settings', {
      cwd: testDir,
      maxBudget: config.budgets.quick,
      timeout: config.timeouts.quick
    });

    assertNoError(result);

    // Verify config.json still exists (skill reads it)
    assertArtifactExists(
      testDir,
      '.planning/config.json',
      'Expected config.json to exist'
    );
  });
});
