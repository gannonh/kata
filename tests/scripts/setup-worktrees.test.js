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
 * setup-worktrees.sh Tests
 *
 * Tests precondition checks (exit codes, error messages) and full bare repo
 * conversion. Uses real git repos in tmpDir — no mocking.
 *
 * Run with: node --test tests/scripts/setup-worktrees.test.js
 */

let tmpDir;
let skillsDir; // Skills live outside the repo so the conversion cleanup doesn't delete them

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
  PATH: process.env.PATH,
  HOME: process.env.HOME
};

function createGitRepo(dir) {
  execSync('git init -b main', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  // Create .planning/config.json with pr_workflow true
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning/config.json'),
    JSON.stringify({ pr_workflow: 'true' }, null, 2)
  );
  execSync('git add .planning/config.json', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execSync('git commit -m "add config"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
}

function copySkillsExternal() {
  // Copy built skills to a directory outside the repo so conversion cleanup
  // doesn't delete scripts that SCRIPT_DIR references
  skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-skills-'));
  fs.cpSync(SKILLS_DIR, path.join(skillsDir, 'skills'), { recursive: true });
  const scripts = execSync(`find "${path.join(skillsDir, 'skills')}" -name "*.sh" -type f`, {
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  for (const script of scripts) {
    fs.chmodSync(script, 0o755);
  }
  return path.join(skillsDir, 'skills');
}

function runScript(cwd, extraEnv = {}) {
  const script = path.join(skillsDir, 'skills/kata-configure-settings/scripts/setup-worktrees.sh');
  return execSync(`bash "${script}"`, {
    cwd,
    encoding: 'utf8',
    env: { ...GIT_ENV, ...extraEnv },
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

describe('setup-worktrees.sh', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-worktree-test-'));
    copySkillsExternal();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (skillsDir) fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  test('exits 1 when pr_workflow is false', () => {
    createGitRepo(tmpDir);

    // Override config to pr_workflow false
    fs.writeFileSync(
      path.join(tmpDir, '.planning/config.json'),
      JSON.stringify({ pr_workflow: 'false' }, null, 2)
    );

    try {
      runScript(tmpDir);
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.strictEqual(err.status, 1, `Expected exit 1, got ${err.status}`);
      const output = err.stdout.toString();
      assert.ok(
        output.includes('pr_workflow'),
        `Stderr should mention pr_workflow, got: ${output}`
      );
    }
  });

  test('exits 1 when not a git repo', () => {
    // No git init — just create the directory structure
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning/config.json'),
      JSON.stringify({ pr_workflow: 'true' }, null, 2)
    );

    try {
      runScript(tmpDir);
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.strictEqual(err.status, 1, `Expected exit 1, got ${err.status}`);
      const output = err.stdout.toString();
      assert.ok(
        output.includes('Not a git repository'),
        `Output should mention "Not a git repository", got: ${output}`
      );
    }
  });

  test('exits 1 when working tree is dirty', () => {
    createGitRepo(tmpDir);

    // Create an untracked file to dirty the working tree
    fs.writeFileSync(path.join(tmpDir, 'dirty.txt'), 'uncommitted');

    try {
      runScript(tmpDir);
      assert.fail('Should have exited with code 1');
    } catch (err) {
      assert.strictEqual(err.status, 1, `Expected exit 1, got ${err.status}`);
      const output = err.stdout.toString();
      assert.ok(
        output.includes('uncommitted changes'),
        `Output should mention "uncommitted changes", got: ${output}`
      );
    }
  });

  test('exits 0 (idempotent) when .bare already exists', () => {
    createGitRepo(tmpDir);
    // Simulate already-converted state
    fs.mkdirSync(path.join(tmpDir, '.bare'), { recursive: true });

    const result = runScript(tmpDir);
    assert.ok(
      result.includes('Already converted'),
      `Output should contain "Already converted", got: ${result}`
    );
  });

  test('full conversion creates bare repo + worktree layout', () => {
    createGitRepo(tmpDir);

    runScript(tmpDir);

    // .bare/ is a directory
    const bareStat = fs.statSync(path.join(tmpDir, '.bare'));
    assert.ok(bareStat.isDirectory(), '.bare should be a directory');

    // .git is a file (not directory) containing "gitdir: .bare"
    const gitStat = fs.lstatSync(path.join(tmpDir, '.git'));
    assert.ok(gitStat.isFile(), '.git should be a file, not directory');
    const gitContent = fs.readFileSync(path.join(tmpDir, '.git'), 'utf8').trim();
    assert.strictEqual(gitContent, 'gitdir: .bare', '.git should point to .bare');

    // main/ directory exists
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'main')),
      'main/ worktree directory should exist'
    );
  });
});
