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
 * manage-worktree.sh Tests
 *
 * Tests precondition checks (bare repo required, worktree enabled, unknown
 * subcommand, usage output) and create/list subcommands using real git repos
 * in tmpDir. Merge subcommand is skipped (slow, fragile in temp repos).
 *
 * Run with: node --test tests/scripts/manage-worktree.test.js
 */

let tmpDir;
let skillsDir;

const GIT_ENV = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@test.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@test.com',
  PATH: process.env.PATH,
  HOME: process.env.HOME
};

function copySkillsExternal() {
  skillsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-skills-'));
  fs.cpSync(SKILLS_DIR, path.join(skillsDir, 'skills'), { recursive: true });
  const scripts = execSync(`find "${path.join(skillsDir, 'skills')}" -name "*.sh" -type f`, {
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  for (const script of scripts) {
    fs.chmodSync(script, 0o755);
  }
}

/**
 * Creates a bare repo layout suitable for manage-worktree.sh testing.
 * Manual approach: git init, commit, clone --bare, set up .git pointer,
 * add main worktree, write config at project root.
 */
function createBareRepo(dir) {
  // 1. Initialize a normal repo and make a commit
  execSync('git init -b main', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning/config.json'),
    JSON.stringify({ pr_workflow: 'true', worktree: { enabled: 'true' } }, null, 2)
  );
  execSync('git add -A', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });

  // 2. Clone as bare into .bare/
  execSync('git clone --bare . .bare', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });

  // 3. Remove original .git, replace with pointer
  fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, '.git'), 'gitdir: .bare\n');

  // 4. Add main worktree
  execSync('GIT_DIR=.bare git worktree add main main', {
    cwd: dir,
    env: GIT_ENV,
    stdio: 'pipe'
  });

  // 5. Config must be at project root for read-config.sh (cwd-relative)
  // .planning/config.json already exists from step 1, but after bare clone
  // the original files are still in project root (we didn't clean them).
  // Ensure it's there:
  if (!fs.existsSync(path.join(dir, '.planning/config.json'))) {
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning/config.json'),
      JSON.stringify({ pr_workflow: 'true', worktree: { enabled: 'true' } }, null, 2)
    );
  }
}

function runManageWorktree(cwd, args, expectFailure = false) {
  const script = path.join(skillsDir, 'skills/kata-execute-phase/scripts/manage-worktree.sh');
  const cmd = `bash "${script}" ${args}`;
  if (expectFailure) {
    try {
      execSync(cmd, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'] });
      assert.fail('Expected command to exit with non-zero code');
    } catch (err) {
      return { status: err.status, stdout: err.stdout?.toString() || '', stderr: err.stderr?.toString() || '' };
    }
  }
  const stdout = execSync(cmd, { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'] });
  return { status: 0, stdout, stderr: '' };
}

function parseOutput(stdout) {
  const pairs = {};
  for (const line of stdout.trim().split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) {
      pairs[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return pairs;
}

describe('manage-worktree.sh', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-mw-test-'));
    copySkillsExternal();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (skillsDir) fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  describe('precondition checks', () => {
    test('exits 1 when .bare directory missing', () => {
      // No bare setup, just a config file so read-config.sh doesn't fail first
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning/config.json'),
        JSON.stringify({ worktree: { enabled: 'true' } }, null, 2)
      );

      const result = runManageWorktree(tmpDir, 'list', true);
      assert.strictEqual(result.status, 1);
      assert.ok(
        result.stderr.includes('Bare repo layout required'),
        `Stderr should mention bare repo, got: ${result.stderr}`
      );
    });

    test('exits 1 when worktree.enabled is false', () => {
      // Create .bare dir but config says false
      fs.mkdirSync(path.join(tmpDir, '.bare'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.planning/config.json'),
        JSON.stringify({ worktree: { enabled: 'false' } }, null, 2)
      );

      const result = runManageWorktree(tmpDir, 'list', true);
      assert.strictEqual(result.status, 1);
      assert.ok(
        result.stderr.includes('worktree.enabled is false'),
        `Stderr should mention worktree.enabled, got: ${result.stderr}`
      );
    });

    test('exits 1 with unknown subcommand', () => {
      // Need preconditions to pass first
      createBareRepo(tmpDir);

      const result = runManageWorktree(tmpDir, 'badcmd', true);
      assert.strictEqual(result.status, 1);
      assert.ok(
        result.stderr.includes('Unknown subcommand'),
        `Stderr should mention unknown subcommand, got: ${result.stderr}`
      );
    });

    test('shows usage when no subcommand given', () => {
      // No args at all — script shows usage before checking preconditions
      const result = runManageWorktree(tmpDir, '', true);
      assert.strictEqual(result.status, 1);
      assert.ok(
        result.stdout.includes('Usage'),
        `Stdout should show usage, got: ${result.stdout}`
      );
    });
  });

  describe('create subcommand', () => {
    test('creates worktree for a plan', () => {
      createBareRepo(tmpDir);

      const result = runManageWorktree(tmpDir, 'create 48 01');
      const kv = parseOutput(result.stdout);

      assert.strictEqual(kv.WORKTREE_PATH, 'plan-48-01');
      assert.strictEqual(kv.WORKTREE_BRANCH, 'plan/48-01');
      assert.strictEqual(kv.STATUS, 'created');

      // Verify directory exists
      assert.ok(
        fs.existsSync(path.join(tmpDir, 'plan-48-01')),
        'plan-48-01/ directory should exist'
      );
    });

    test('idempotent create returns exists status', () => {
      createBareRepo(tmpDir);

      // First create
      runManageWorktree(tmpDir, 'create 48 01');

      // Second create should return exists
      const result = runManageWorktree(tmpDir, 'create 48 01');
      const kv = parseOutput(result.stdout);

      assert.strictEqual(kv.STATUS, 'exists');
      assert.strictEqual(kv.WORKTREE_PATH, 'plan-48-01');
      assert.strictEqual(kv.WORKTREE_BRANCH, 'plan/48-01');
    });
  });

  describe('list subcommand', () => {
    test('lists created worktrees', () => {
      createBareRepo(tmpDir);

      // Create one worktree
      runManageWorktree(tmpDir, 'create 48 01');

      const result = runManageWorktree(tmpDir, 'list');
      const kv = parseOutput(result.stdout);

      assert.strictEqual(kv.WORKTREE_COUNT, '1');
      assert.ok(
        result.stdout.includes('plan-48-01'),
        `List should include plan-48-01, got: ${result.stdout}`
      );
    });

    test('empty list when no plan worktrees exist', () => {
      createBareRepo(tmpDir);

      const result = runManageWorktree(tmpDir, 'list');
      const kv = parseOutput(result.stdout);

      assert.strictEqual(kv.WORKTREE_COUNT, '0');
    });
  });
});
