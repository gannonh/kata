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
 * kata-lib.cjs resolve-root Tests
 *
 * Tests the shared project root detection via kata-lib.cjs resolve-root
 * (replacement for the former project-root.sh).
 *
 * Run with: node --test tests/scripts/project-root.test.js
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

// Helper: run kata-lib.cjs resolve-root and return the resolved path
function runResolveRoot(skillsDir, opts = {}) {
  const katalib = path.join(skillsDir, 'kata-configure-settings/scripts/kata-lib.cjs');
  const env = { ...process.env, ...(opts.env || {}) };
  return execSync(`node "${katalib}" resolve-root`, {
    cwd: opts.cwd || tmpDir,
    encoding: 'utf8',
    env,
    stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}

describe('project-root.sh', () => {
  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-projroot-test-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects project root when CWD has .planning/', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const skillsDir = copySkills(tmpDir);
    const result = runResolveRoot(skillsDir, { cwd: tmpDir });
    assert.strictEqual(result, tmpDir);
  });

  test('detects project root via main/.planning/ (bare repo root)', () => {
    // Simulate bare repo layout: CWD is parent, main/.planning/ exists
    const mainDir = path.join(tmpDir, 'main');
    fs.mkdirSync(path.join(mainDir, '.planning'), { recursive: true });
    const skillsDir = copySkills(tmpDir);
    const result = runResolveRoot(skillsDir, { cwd: tmpDir });
    assert.strictEqual(result, mainDir);
  });

  test('uses KATA_PROJECT_ROOT env var when set', () => {
    // Create project root in a completely separate directory
    const projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-projroot-proj-')));
    fs.mkdirSync(path.join(projectDir, '.planning'), { recursive: true });
    const skillsDir = copySkills(tmpDir);

    // CWD is tmpDir (no .planning/), but env var points to projectDir
    const result = runResolveRoot(skillsDir, {
      cwd: tmpDir,
      env: { KATA_PROJECT_ROOT: projectDir }
    });
    assert.strictEqual(result, projectDir);

    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('KATA_PROJECT_ROOT takes priority over CWD', () => {
    // Both CWD and env var have .planning/, env var wins
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-projroot-proj-')));
    fs.mkdirSync(path.join(projectDir, '.planning'), { recursive: true });
    const skillsDir = copySkills(tmpDir);

    const result = runResolveRoot(skillsDir, {
      cwd: tmpDir,
      env: { KATA_PROJECT_ROOT: projectDir }
    });
    assert.strictEqual(result, projectDir);

    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('prefers workspace/.planning over main/.planning when both exist', () => {
    // Simulate bare repo layout with both workspace/ and main/ having .planning/
    fs.mkdirSync(path.join(tmpDir, 'workspace/.planning'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'main/.planning'), { recursive: true });
    const skillsDir = copySkills(tmpDir);

    const result = runResolveRoot(skillsDir, { cwd: tmpDir });
    // resolve-root priority: workspace/.planning beats main/.planning
    assert.strictEqual(result, path.join(tmpDir, 'workspace'));
  });

  test('errors when project root not found', () => {
    // No .planning/ anywhere, no env var
    const skillsDir = copySkills(tmpDir);
    const katalib = path.join(skillsDir, 'kata-configure-settings/scripts/kata-lib.cjs');
    try {
      execSync(`node "${katalib}" resolve-root`, {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.fail('Should have exited with non-zero code');
    } catch (err) {
      assert.ok(err.status !== 0, `Exit code should be non-zero, got: ${err.status}`);
      assert.ok(
        err.stderr.includes('Cannot find project root'),
        `Should include error message, got: ${err.stderr}`
      );
    }
  });

  test('errors when KATA_PROJECT_ROOT set but .planning/ missing there', () => {
    // Env var points to a directory without .planning/
    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-projroot-bad-'));
    const skillsDir = copySkills(tmpDir);
    const katalib = path.join(skillsDir, 'kata-configure-settings/scripts/kata-lib.cjs');
    try {
      execSync(`node "${katalib}" resolve-root`, {
        cwd: tmpDir,
        encoding: 'utf8',
        env: { ...process.env, KATA_PROJECT_ROOT: badDir },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.fail('Should have exited with non-zero code');
    } catch (err) {
      assert.ok(err.status !== 0);
    }

    fs.rmSync(badDir, { recursive: true, force: true });
  });
});

describe('project-root.sh integration with scripts', () => {
  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-projroot-int-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('read-config.sh works via KATA_PROJECT_ROOT when CWD is wrong', () => {
    // Simulate the bug: CWD is the plugin dir, project is elsewhere
    const projectDir = path.join(tmpDir, 'project');
    fs.mkdirSync(path.join(projectDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.planning/config.json'),
      JSON.stringify({ worktree: { enabled: true } }, null, 2)
    );

    const pluginDir = path.join(tmpDir, 'plugin');
    const skillsDir = copySkills(pluginDir);
    const katalib = path.join(skillsDir, 'kata-configure-settings/scripts/kata-lib.cjs');

    // Run from plugin dir (wrong CWD) with KATA_PROJECT_ROOT set
    const result = execSync(`node "${katalib}" read-config "worktree.enabled" "false"`, {
      cwd: pluginDir,
      encoding: 'utf8',
      env: { ...process.env, KATA_PROJECT_ROOT: projectDir },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    assert.strictEqual(result, 'true');
  });

  test('read-config.sh errors when CWD is wrong and no env var', () => {
    const pluginDir = path.join(tmpDir, 'plugin');
    const skillsDir = copySkills(pluginDir);
    const katalib = path.join(skillsDir, 'kata-configure-settings/scripts/kata-lib.cjs');

    try {
      execSync(`node "${katalib}" read-config "worktree.enabled" "false"`, {
        cwd: pluginDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      assert.fail('Should have exited with non-zero code');
    } catch (err) {
      assert.ok(err.status !== 0);
      assert.ok(err.stderr.includes('Cannot find project root'));
    }
  });

  test('find-phase.sh works via KATA_PROJECT_ROOT when CWD is wrong', () => {
    // Set up project with a phase
    const projectDir = path.join(tmpDir, 'project');
    const phaseDir = path.join(projectDir, '.planning/phases/pending/01-setup');
    fs.mkdirSync(phaseDir, { recursive: true });
    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');

    const pluginDir = path.join(tmpDir, 'plugin');
    const skillsDir = copySkills(pluginDir);
    const script = path.join(skillsDir, 'kata-execute-phase/scripts/find-phase.sh');

    const result = execSync(`bash "${script}" "1"`, {
      cwd: pluginDir,
      encoding: 'utf8',
      env: { ...process.env, KATA_PROJECT_ROOT: projectDir },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    assert.ok(result.includes('PHASE_DIR='));
    assert.ok(result.includes('PLAN_COUNT=1'));
  });
});
