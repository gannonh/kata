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
 * find-phase.sh Tests
 *
 * Tests the bash script that locates phase directories across
 * active/pending/completed states.
 * Pure function: no git, no network, no Claude invocation.
 *
 * Run with: node --test tests/scripts/find-phase.test.js
 */

let tmpDir;

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

function parseKeyValue(output) {
  const result = {};
  for (const line of output.trim().split('\n')) {
    const eq = line.indexOf('=');
    if (eq !== -1) {
      result[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return result;
}

function runScript(cwd, ...args) {
  const script = path.join(cwd, 'skills/kata-execute-phase/scripts/find-phase.sh');
  return execSync(`bash "${script}" ${args.join(' ')}`, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

describe('find-phase.sh', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-findphase-test-'));
    fs.mkdirSync(path.join(tmpDir, '.planning/phases'), { recursive: true });
    copySkills(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('finds phase in pending state', () => {
    const phaseDir = path.join(tmpDir, '.planning/phases/pending/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '05-01-PLAN.md'), '# Plan');

    const output = runScript(tmpDir, '5');
    const kv = parseKeyValue(output);

    assert.ok(kv.PHASE_DIR.endsWith('05-auth'), `PHASE_DIR should end with 05-auth, got: ${kv.PHASE_DIR}`);
    assert.strictEqual(kv.PHASE_STATE, 'pending');
    assert.strictEqual(kv.PLAN_COUNT, '1');
  });

  test('finds phase in active state', () => {
    const phaseDir = path.join(tmpDir, '.planning/phases/active/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '05-01-PLAN.md'), '# Plan');

    const output = runScript(tmpDir, '5');
    const kv = parseKeyValue(output);

    assert.ok(kv.PHASE_DIR.endsWith('05-auth'), `PHASE_DIR should end with 05-auth, got: ${kv.PHASE_DIR}`);
    assert.strictEqual(kv.PHASE_STATE, 'active');
    assert.strictEqual(kv.PLAN_COUNT, '1');
  });

  test('finds phase in completed state', () => {
    const phaseDir = path.join(tmpDir, '.planning/phases/completed/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '05-01-PLAN.md'), '# Plan');

    const output = runScript(tmpDir, '5');
    const kv = parseKeyValue(output);

    assert.ok(kv.PHASE_DIR.endsWith('05-auth'), `PHASE_DIR should end with 05-auth, got: ${kv.PHASE_DIR}`);
    assert.strictEqual(kv.PHASE_STATE, 'completed');
    assert.strictEqual(kv.PLAN_COUNT, '1');
  });

  test('exit 1 when phase not found', () => {
    try {
      runScript(tmpDir, '99');
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.strictEqual(err.status, 1, `Exit code should be 1, got: ${err.status}`);
      const stdout = err.stdout.toString();
      assert.ok(stdout.includes('No phase directory'), `Should mention "No phase directory", got: ${stdout}`);
    }
  });

  test('exit 2 when phase found but no plans', () => {
    const phaseDir = path.join(tmpDir, '.planning/phases/pending/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });

    try {
      runScript(tmpDir, '5');
      assert.fail('Should have exited with code 2');
    } catch (err) {
      assert.strictEqual(err.status, 2, `Exit code should be 2, got: ${err.status}`);
      const stdout = err.stdout.toString();
      assert.ok(stdout.includes('No plans found'), `Should mention "No plans found", got: ${stdout}`);
    }
  });

  test('exit 3 on collision', () => {
    // Create two directories with same 05- prefix in different states
    fs.mkdirSync(path.join(tmpDir, '.planning/phases/active/05-auth'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning/phases/active/05-auth/05-01-PLAN.md'), '# Plan');
    fs.mkdirSync(path.join(tmpDir, '.planning/phases/pending/05-login'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.planning/phases/pending/05-login/05-01-PLAN.md'), '# Plan');

    try {
      runScript(tmpDir, '5');
      assert.fail('Should have exited with code 3');
    } catch (err) {
      assert.strictEqual(err.status, 3, `Exit code should be 3, got: ${err.status}`);
      const stdout = err.stdout.toString();
      assert.ok(stdout.includes('COLLISION'), `Should mention "COLLISION", got: ${stdout}`);
    }
  });

  test('handles zero-padded lookup', () => {
    const phaseDir = path.join(tmpDir, '.planning/phases/active/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '05-01-PLAN.md'), '# Plan');

    // Pass unpadded "5" — script should find "05-auth"
    const output = runScript(tmpDir, '5');
    const kv = parseKeyValue(output);

    assert.ok(kv.PHASE_DIR.includes('05-auth'), `Should find 05-auth from unpadded input, got: ${kv.PHASE_DIR}`);
    assert.strictEqual(kv.PLAN_COUNT, '1');
  });

  test('flat directory fallback', () => {
    // Place phase directory directly under .planning/phases/ (no state subdir)
    const phaseDir = path.join(tmpDir, '.planning/phases/05-auth');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '05-01-PLAN.md'), '# Plan');

    const output = runScript(tmpDir, '5');
    const kv = parseKeyValue(output);

    assert.ok(kv.PHASE_DIR.endsWith('05-auth'), `PHASE_DIR should end with 05-auth, got: ${kv.PHASE_DIR}`);
    assert.strictEqual(kv.PHASE_STATE, 'flat');
    assert.strictEqual(kv.PLAN_COUNT, '1');
  });
});
