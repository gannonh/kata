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
 * create-phase-branch.sh Tests
 *
 * Tests phase worktree creation, branch type inference from ROADMAP.md goal text,
 * idempotent resume, WORKTREE_PATH output, and main/ branch invariant.
 * Uses bare repo layout with main/ worktree in tmpDir -- no mocking, no network.
 *
 * Run with: node --test tests/scripts/create-phase-branch.test.js
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

function makeRoadmap(phaseNum, goal) {
  // ROADMAP uses unpadded phase numbers (e.g., "Phase 5:" not "Phase 05:")
  const unpadded = String(Number(phaseNum));
  return `# Roadmap

## Current Milestone: v1.10.0

### Phases

#### Phase ${unpadded}: Test Phase
- Goal: ${goal}
- Status: Pending
`;
}

/**
 * Creates a bare repo layout with main/ worktree suitable for
 * create-phase-branch.sh testing. Follows the same pattern as
 * manage-worktree.test.js's createBareRepo.
 */
function createBareRepoWithRoadmap(dir, phaseNum, goal) {
  // 1. Initialize a normal repo and make a commit
  execSync('git init -b main', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  fs.mkdirSync(path.join(dir, '.planning', 'phases', 'pending', `${phaseNum}-test-phase`), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning/ROADMAP.md'),
    makeRoadmap(phaseNum, goal)
  );
  execSync('git add -A', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execSync('git commit -m "init with roadmap"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });

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

  // 5. Remove stale working tree files from project root (only main/ has content)
  // Keep .bare/ and .git pointer; remove .planning/ (original pre-clone artifact)
  fs.rmSync(path.join(dir, '.planning'), { recursive: true, force: true });
}

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

function runScript(cwd, phaseDir) {
  const script = path.join(skillsDir, 'skills/kata-execute-phase/scripts/create-phase-branch.sh');
  return execSync(`bash "${script}" "${phaseDir}"`, {
    cwd,
    encoding: 'utf8',
    env: GIT_ENV,
    stdio: ['pipe', 'pipe', 'pipe']
  });
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

describe('create-phase-branch.sh', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-branch-test-'));
    copySkillsExternal();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (skillsDir) fs.rmSync(skillsDir, { recursive: true, force: true });
  });

  test('creates worktree with correct branch name format', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication endpoints');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(
      kv.BRANCH,
      'feat/v1.10.0-05-test-phase',
      `Branch name should match expected format, got: ${kv.BRANCH}`
    );
  });

  test('WORKTREE_PATH points to phase worktree directory', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication endpoints');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.ok(
      kv.WORKTREE_PATH.endsWith('/feat-v1.10.0-05-test-phase'),
      `WORKTREE_PATH should end with /feat-v1.10.0-05-test-phase, got: ${kv.WORKTREE_PATH}`
    );
    assert.ok(
      fs.existsSync(kv.WORKTREE_PATH),
      `Worktree directory should exist at ${kv.WORKTREE_PATH}`
    );
  });

  test('infers fix branch type', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Fix login bug in auth module');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'fix', `Expected fix, got: ${kv.BRANCH_TYPE}`);
  });

  test('infers docs branch type', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Document API endpoints');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'docs', `Expected docs, got: ${kv.BRANCH_TYPE}`);
  });

  test('infers refactor branch type', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Refactor auth module for clarity');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'refactor', `Expected refactor, got: ${kv.BRANCH_TYPE}`);
  });

  test('defaults to feat branch type', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication system');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'feat', `Expected feat, got: ${kv.BRANCH_TYPE}`);
  });

  test('idempotent: resumes on existing worktree', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication');
    const phaseDir = '.planning/phases/pending/05-test-phase';

    // First run creates the worktree
    const stdout1 = runScript(tmpDir, phaseDir);
    const kv1 = parseOutput(stdout1);

    // Second run resumes
    const stdout2 = runScript(tmpDir, phaseDir);
    const kv2 = parseOutput(stdout2);

    assert.strictEqual(kv1.BRANCH, kv2.BRANCH, 'Branch name should be identical on second run');
    assert.strictEqual(kv1.WORKTREE_PATH, kv2.WORKTREE_PATH, 'WORKTREE_PATH should be identical on second run');
  });

  test('main/ stays on main branch after worktree creation', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication');
    runScript(tmpDir, '.planning/phases/pending/05-test-phase');

    const mainBranch = execSync('git branch --show-current', {
      cwd: path.join(tmpDir, 'main'),
      encoding: 'utf8',
      env: GIT_ENV,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    assert.strictEqual(mainBranch, 'main', `main/ should stay on main branch, got: ${mainBranch}`);
  });

  test('outputs all 6 key=value pairs', () => {
    createBareRepoWithRoadmap(tmpDir, '05', 'Build authentication');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    const expected = ['WORKTREE_PATH', 'BRANCH', 'BRANCH_TYPE', 'MILESTONE', 'PHASE_NUM', 'SLUG'];
    for (const key of expected) {
      assert.ok(
        key in kv && kv[key].length > 0,
        `Output should contain non-empty ${key}, got: ${JSON.stringify(kv)}`
      );
    }
  });
});
