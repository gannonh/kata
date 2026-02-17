import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);

/**
 * detect-stale-intel.cjs Tests
 *
 * Unit tests for detectBrownfieldDocStaleness: verifies brownfield doc
 * staleness detection across 5 edge cases (missing codebase dir, fresh docs,
 * stale docs >30%, malformed date, mixed docs with/without dates).
 *
 * Run with: node --test tests/scripts/detect-stale-intel.test.js
 */

const ROOT = process.cwd();
const SCRIPT_PATH = path.join(ROOT, 'skills/kata-map-codebase/scripts/detect-stale-intel.cjs');
const { detectBrownfieldDocStaleness } = require(SCRIPT_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir;

function writeBrownfieldDoc(dir, docName, analysisDate) {
  const content = `# ${docName.replace('.md', '')}\n\n**Analysis Date:** ${analysisDate}\n\n## Content\nSample content.`;
  fs.writeFileSync(path.join(dir, '.planning/codebase', docName), content);
}

function modifyAndCommit(dir, files, message) {
  for (const file of files) {
    fs.writeFileSync(path.join(dir, file), `// modified ${Date.now()}\n`);
  }
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -m "${message}"`, { cwd: dir, stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// detectBrownfieldDocStaleness
// ---------------------------------------------------------------------------

describe('detectBrownfieldDocStaleness', () => {
  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kata-brownfield-')));

    // Initialize git repo
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });

    // Create .planning directories
    fs.mkdirSync(path.join(tmpDir, '.planning/codebase'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.planning/intel'), { recursive: true });

    // Create 10 source files for meaningful percentages
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(
        path.join(tmpDir, `src/file-${i}.js`),
        `// source file ${i}\nexport const val${i} = ${i};\n`
      );
    }

    // Initial commit
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('no .planning/codebase/ directory returns brownfieldDocStale: false', () => {
    // Remove codebase dir
    fs.rmSync(path.join(tmpDir, '.planning/codebase'), { recursive: true, force: true });

    const result = detectBrownfieldDocStaleness(tmpDir);
    assert.strictEqual(result.brownfieldDocStale, false);
  });

  test('Analysis Date exists, no files changed since returns brownfieldDocStale: false', () => {
    // Get the initial commit date
    const commitDate = execSync(
      'git log -1 --format=%ad --date=format:%Y-%m-%d',
      { cwd: tmpDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    writeBrownfieldDoc(tmpDir, 'ARCHITECTURE.md', commitDate);
    // Commit the brownfield doc so the repo is clean
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add brownfield doc"', { cwd: tmpDir, stdio: 'pipe' });

    const result = detectBrownfieldDocStaleness(tmpDir);
    assert.strictEqual(result.brownfieldDocStale, false);
    assert.strictEqual(result.brownfieldAnalysisDate, commitDate);
    assert.ok(result.brownfieldChangedFiles === 0 || result.brownfieldChangePct <= 0.3,
      `Expected fresh: changedFiles=${result.brownfieldChangedFiles}, changePct=${result.brownfieldChangePct}`);
  });

  test('Analysis Date exists, >30% files changed returns brownfieldDocStale: true', () => {
    // Use a past date for the Analysis Date so git log --until picks the
    // initial commit, not the later modification commit (all commits happen
    // in the same second without backdating).
    const pastDate = '2025-01-01';

    writeBrownfieldDoc(tmpDir, 'ARCHITECTURE.md', pastDate);
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    // Backdate this commit to match the Analysis Date
    execSync('git commit -m "add brownfield doc"', {
      cwd: tmpDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: `${pastDate}T12:00:00`,
        GIT_COMMITTER_DATE: `${pastDate}T12:00:00`,
      },
    });

    // Modify >30% of source files (4 out of 10) with today's date
    modifyAndCommit(
      tmpDir,
      ['src/file-0.js', 'src/file-1.js', 'src/file-2.js', 'src/file-3.js'],
      'modify 4 source files'
    );

    const result = detectBrownfieldDocStaleness(tmpDir);
    assert.strictEqual(result.brownfieldDocStale, true);
    assert.ok(result.brownfieldChangePct > 0.3,
      `Expected changePct > 0.3, got ${result.brownfieldChangePct}`);
    assert.ok(result.brownfieldChangedFiles >= 4,
      `Expected changedFiles >= 4, got ${result.brownfieldChangedFiles}`);
  });

  test('malformed Analysis Date returns brownfieldDocStale: false', () => {
    // Write doc with non-matching date format
    const content = '# ARCHITECTURE\n\n**Analysis Date:** not-a-date\n\n## Content\nSample.';
    fs.writeFileSync(path.join(tmpDir, '.planning/codebase/ARCHITECTURE.md'), content);

    const result = detectBrownfieldDocStaleness(tmpDir);
    assert.strictEqual(result.brownfieldDocStale, false);
  });

  test('mixed docs: picks Analysis Date from first doc that has one', () => {
    // ARCHITECTURE.md without Analysis Date
    const archContent = '# ARCHITECTURE\n\n## Overview\nNo date header here.';
    fs.writeFileSync(path.join(tmpDir, '.planning/codebase/ARCHITECTURE.md'), archContent);

    // Get initial commit date for STACK.md
    const commitDate = execSync(
      'git log -1 --format=%ad --date=format:%Y-%m-%d',
      { cwd: tmpDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    writeBrownfieldDoc(tmpDir, 'STACK.md', commitDate);
    execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit -m "add mixed brownfield docs"', { cwd: tmpDir, stdio: 'pipe' });

    const result = detectBrownfieldDocStaleness(tmpDir);
    assert.strictEqual(result.brownfieldAnalysisDate, commitDate);
    assert.ok(result.brownfieldAnalysisDate, 'Expected analysisDate to be populated');
  });
});
