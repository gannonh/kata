import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const PLUGIN_DIR = path.join(ROOT, 'dist/plugin');
const SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');

/**
 * kata-lib.cjs read-config Tests
 *
 * Tests the read-config command in kata-lib.cjs that reads .planning/config.json values.
 * Pure function: no git, no network, no Claude invocation.
 *
 * Run with: node --test tests/scripts/read-config.test.js
 */

let tmpDir;

const CONFIG_FIXTURE = JSON.stringify({
  pr_workflow: 'true',
  worktree: { enabled: 'true' },
  depth: 'standard'
}, null, 2);

function copySkills(dir) {
  const destSkills = path.join(dir, 'skills');
  fs.cpSync(SKILLS_DIR, destSkills, { recursive: true });
  const scripts = execSync(`find "${destSkills}" -name "*.sh" -type f`, {
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  for (const script of scripts) {
    fs.chmodSync(script, 0o755);
  }
  return destSkills;
}

describe('read-config.sh', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-readcfg-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning/config.json'), CONFIG_FIXTURE);
    copySkills(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runScript(...args) {
    const katalib = path.join(tmpDir, 'skills/kata-configure-settings/scripts/kata-lib.cjs');
    return execSync(`node "${katalib}" read-config ${args.map(a => `"${a}"`).join(' ')}`, {
      cwd: tmpDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
  }

  test('reads a top-level key', () => {
    const result = runScript('pr_workflow');
    assert.strictEqual(result, 'true');
  });

  test('reads a nested key', () => {
    const result = runScript('worktree.enabled');
    assert.strictEqual(result, 'true');
  });

  test('returns fallback when key is missing', () => {
    const result = runScript('nonexistent', 'mydefault');
    assert.strictEqual(result, 'mydefault');
  });

  test('returns empty string when key missing and no fallback', () => {
    const result = runScript('nonexistent');
    assert.strictEqual(result, '');
  });

  test('returns JSON string for object values', () => {
    const result = runScript('worktree');
    const parsed = JSON.parse(result);
    assert.deepStrictEqual(parsed, { enabled: 'true' });
  });

  test('returns empty string when config.json does not exist', () => {
    // Remove config file
    fs.unlinkSync(path.join(tmpDir, '.planning/config.json'));
    const result = runScript('pr_workflow');
    assert.strictEqual(result, '');
  });

  test('exits non-zero when no arguments provided', () => {
    const katalib = path.join(tmpDir, 'skills/kata-configure-settings/scripts/kata-lib.cjs');
    try {
      execSync(`node "${katalib}" read-config`, {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.fail('Should have exited with non-zero code');
    } catch (err) {
      assert.ok(err.status !== 0, `Exit code should be non-zero, got: ${err.status}`);
    }
  });
});
