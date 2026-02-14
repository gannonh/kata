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

  test('exits 0 (idempotent) when .bare and workspace/ already exist', () => {
    createGitRepo(tmpDir);
    // Simulate fully-converted state (both .bare/ and workspace/)
    fs.mkdirSync(path.join(tmpDir, '.bare'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });

    const result = runScript(tmpDir);
    assert.ok(
      result.includes('Already converted'),
      `Output should contain "Already converted", got: ${result}`
    );
  });

  test('exits 0 (idempotent) when running inside a worktree with workspace/', () => {
    // Simulate being inside a worktree: ../.bare and ../workspace/ exist at parent level
    fs.mkdirSync(path.join(tmpDir, '.bare'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
    const subDir = path.join(tmpDir, 'main');
    fs.mkdirSync(path.join(subDir, '.planning'), { recursive: true });

    const result = runScript(subDir);
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

    // workspace/ directory exists
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'workspace')),
      'workspace/ worktree directory should exist'
    );

    // workspace/ is on workspace-base branch
    const wsBranch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'workspace'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(wsBranch, 'workspace-base',
      `workspace/ should be on workspace-base branch, got: ${wsBranch}`);

    // README.md exists at project root with worktree instructions
    const readme = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.ok(
      readme.includes('cd workspace'),
      'README should tell user to cd into workspace/'
    );
  });

  test('workspace/ worktree created on workspace-base branch', () => {
    createGitRepo(tmpDir);
    runScript(tmpDir);

    // workspace/ directory exists
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'workspace')),
      'workspace/ directory should exist'
    );

    // workspace/ is on workspace-base branch
    const branch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'workspace'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(branch, 'workspace-base',
      `workspace/ should be on workspace-base branch, got: ${branch}`);
  });

  test('workspace/ added to .gitignore', () => {
    createGitRepo(tmpDir);
    runScript(tmpDir);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(
      gitignore.includes('workspace/'),
      '.gitignore should include workspace/'
    );
  });

  test('works with master branch (non-main default)', () => {
    // Init with master instead of main
    execSync('git init -b master', { cwd: tmpDir, env: GIT_ENV, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', { cwd: tmpDir, env: GIT_ENV, stdio: 'pipe' });
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, '.planning/config.json'),
      JSON.stringify({ pr_workflow: 'true' }, null, 2)
    );
    execSync('git add .planning/config.json', { cwd: tmpDir, env: GIT_ENV, stdio: 'pipe' });
    execSync('git commit -m "add config"', { cwd: tmpDir, env: GIT_ENV, stdio: 'pipe' });

    runScript(tmpDir);

    // main/ worktree directory exists (directory always named main/)
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'main')),
      'main/ worktree directory should exist even with master branch'
    );

    // Verify the main worktree has the master branch checked out
    const branch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'main'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(branch, 'master', 'main/ worktree should have master branch checked out');

    // workspace/ directory exists
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'workspace')),
      'workspace/ worktree directory should exist even with master branch'
    );

    // workspace/ is on workspace-base branch (based on master)
    const wsBranch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'workspace'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(wsBranch, 'workspace-base',
      `workspace/ should be on workspace-base branch, got: ${wsBranch}`);
  });

  test('preserves original remote URL after conversion', () => {
    createGitRepo(tmpDir);

    // Add a fake remote to simulate GitHub
    execSync('git remote add origin https://github.com/test/repo.git', {
      cwd: tmpDir, env: GIT_ENV, stdio: 'pipe'
    });

    runScript(tmpDir);

    // Verify the bare repo's remote still points to GitHub, not local path
    const remoteUrl = execSync('GIT_DIR=.bare git remote get-url origin', {
      cwd: tmpDir, env: GIT_ENV, encoding: 'utf8'
    }).trim();
    assert.strictEqual(
      remoteUrl,
      'https://github.com/test/repo.git',
      `Remote should be preserved, got: ${remoteUrl}`
    );
  });

  test('sets upstream tracking when remote exists', () => {
    createGitRepo(tmpDir);

    // Add a fake remote to simulate GitHub
    execSync('git remote add origin https://github.com/test/repo.git', {
      cwd: tmpDir, env: GIT_ENV, stdio: 'pipe'
    });

    runScript(tmpDir);

    // Verify branch tracking config is set (git push will use this)
    const remote = execSync('git -C main config branch.main.remote', {
      cwd: tmpDir, env: GIT_ENV, encoding: 'utf8'
    }).trim();
    assert.strictEqual(remote, 'origin', `branch.main.remote should be origin, got: ${remote}`);

    const merge = execSync('git -C main config branch.main.merge', {
      cwd: tmpDir, env: GIT_ENV, encoding: 'utf8'
    }).trim();
    assert.strictEqual(
      merge,
      'refs/heads/main',
      `branch.main.merge should be refs/heads/main, got: ${merge}`
    );
  });
});

describe('setup-worktrees.sh migration', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-worktree-migrate-'));
    copySkillsExternal();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (skillsDir) fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  function createOldBareRepo(dir) {
    // Create a bare repo layout WITHOUT workspace/ (old v1.10.0 layout)
    execSync('git init -b main', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
    fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.planning/config.json'),
      JSON.stringify({ pr_workflow: 'true', worktree: { enabled: true } }, null, 2)
    );
    execSync('git add .planning/config.json', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
    execSync('git commit -m "add config"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });

    execSync('git clone --bare . .bare', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
    fs.writeFileSync(path.join(dir, '.git'), 'gitdir: .bare\n');

    // Only add main/ worktree (old layout)
    execSync('GIT_DIR=.bare git worktree add main main', {
      cwd: dir, env: GIT_ENV, stdio: 'pipe'
    });

    // Clean stale files from project root
    fs.rmSync(path.join(dir, '.planning'), { recursive: true, force: true });
  }

  test('migrates old layout: creates workspace/ from project root', () => {
    createOldBareRepo(tmpDir);

    const result = runScript(tmpDir);

    // workspace/ directory exists
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'workspace')),
      'workspace/ should be created by migration'
    );

    // workspace/ is on workspace-base branch
    const branch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'workspace'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(branch, 'workspace-base',
      `workspace/ should be on workspace-base branch, got: ${branch}`);

    // Output mentions migration
    assert.ok(
      result.includes('Migration complete'),
      `Output should mention migration, got: ${result}`
    );

    // Output tells user to cd into workspace/
    assert.ok(
      result.includes('workspace'),
      `Output should mention workspace/, got: ${result}`
    );
  });

  test('migrates old layout: creates workspace/ from inside main/', () => {
    createOldBareRepo(tmpDir);

    // Run from inside main/ (where user would be in old layout)
    const result = runScript(path.join(tmpDir, 'main'));

    // workspace/ directory exists at project root
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'workspace')),
      'workspace/ should be created at project root by migration from main/'
    );

    // workspace/ is on workspace-base branch
    const branch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'workspace'),
      env: GIT_ENV,
      encoding: 'utf8'
    }).trim();
    assert.strictEqual(branch, 'workspace-base',
      `workspace/ should be on workspace-base branch, got: ${branch}`);
  });

  test('migration adds workspace/ to .gitignore', () => {
    createOldBareRepo(tmpDir);

    // Create a .gitignore with existing entries (like old setup would have)
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.bare\nmain/\n');

    runScript(tmpDir);

    const gitignore = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8');
    assert.ok(
      gitignore.includes('workspace/'),
      `.gitignore should include workspace/ after migration, got: ${gitignore}`
    );
    // Existing entries preserved
    assert.ok(
      gitignore.includes('.bare'),
      `.gitignore should still include .bare, got: ${gitignore}`
    );
  });

  test('migration sets upstream tracking when remote exists', () => {
    createOldBareRepo(tmpDir);

    // Add a remote to the bare repo
    execSync('GIT_DIR=.bare git remote set-url origin https://github.com/test/repo.git', {
      cwd: tmpDir, env: GIT_ENV, stdio: 'pipe'
    });

    runScript(tmpDir);

    const remote = execSync('git -C workspace config branch.workspace-base.remote', {
      cwd: tmpDir, env: GIT_ENV, encoding: 'utf8'
    }).trim();
    assert.strictEqual(remote, 'origin',
      `workspace-base should track origin, got: ${remote}`);
  });
});
