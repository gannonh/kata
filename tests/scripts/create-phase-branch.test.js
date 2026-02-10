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
 * Tests branch creation, branch type inference from ROADMAP.md goal text,
 * idempotent resume, and key=value output format.
 * Uses real git repos in tmpDir -- no mocking, no network.
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
  return `# Roadmap

## Current Milestone: v1.10.0

### Phases

#### Phase ${phaseNum}: Test Phase
- Goal: ${goal}
- Status: Pending
`;
}

function createGitRepoWithRoadmap(dir, phaseNum, goal) {
  execSync('git init -b main', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  // Create ROADMAP and phase directory
  fs.mkdirSync(path.join(dir, '.planning', 'phases', 'pending', `${phaseNum}-test-phase`), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.planning/ROADMAP.md'),
    makeRoadmap(phaseNum, goal)
  );
  execSync('git add -A', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
  execSync('git commit -m "init with roadmap"', { cwd: dir, env: GIT_ENV, stdio: 'pipe' });
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

  test('creates branch with correct name format', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Build authentication endpoints');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(
      kv.BRANCH,
      'feat/v1.10.0-05-test-phase',
      `Branch name should match expected format, got: ${kv.BRANCH}`
    );
  });

  test('infers fix branch type', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Fix login bug in auth module');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'fix', `Expected fix, got: ${kv.BRANCH_TYPE}`);
  });

  test('infers docs branch type', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Document API endpoints');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'docs', `Expected docs, got: ${kv.BRANCH_TYPE}`);
  });

  test('infers refactor branch type', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Refactor auth module for clarity');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'refactor', `Expected refactor, got: ${kv.BRANCH_TYPE}`);
  });

  test('defaults to feat branch type', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Build authentication system');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    assert.strictEqual(kv.BRANCH_TYPE, 'feat', `Expected feat, got: ${kv.BRANCH_TYPE}`);
  });

  test('idempotent: resumes on existing branch', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Build authentication');
    const script = path.join(skillsDir, 'skills/kata-execute-phase/scripts/create-phase-branch.sh');
    const phaseDir = '.planning/phases/pending/05-test-phase';

    // First run creates the branch
    const stdout1 = execSync(`bash "${script}" "${phaseDir}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      env: GIT_ENV,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Second run resumes on same branch
    const result2 = execSync(`bash "${script}" "${phaseDir}"`, {
      cwd: tmpDir,
      encoding: 'utf8',
      env: GIT_ENV,
      // Need stderr to check "exists, resuming"
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const kv1 = parseOutput(stdout1);
    const kv2 = parseOutput(result2);
    assert.strictEqual(kv1.BRANCH, kv2.BRANCH, 'Branch name should be identical on second run');
  });

  test('outputs all 5 key=value pairs', () => {
    createGitRepoWithRoadmap(tmpDir, '05', 'Build authentication');
    const stdout = runScript(tmpDir, '.planning/phases/pending/05-test-phase');
    const kv = parseOutput(stdout);

    const expected = ['BRANCH', 'BRANCH_TYPE', 'MILESTONE', 'PHASE_NUM', 'SLUG'];
    for (const key of expected) {
      assert.ok(
        key in kv && kv[key].length > 0,
        `Output should contain non-empty ${key}, got: ${JSON.stringify(kv)}`
      );
    }
  });
});
