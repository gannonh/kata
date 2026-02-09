import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const PLUGIN_DIR = path.join(ROOT, 'dist/plugin');
const SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');

/**
 * Template System Tests
 *
 * Tests the bash scripts that power Kata's template override system:
 * - resolve-template.sh (in kata-execute-phase/scripts/)
 * - list-templates.sh (in kata-customize/scripts/)
 * - check-template-drift.sh (in kata-doctor/scripts/)
 *
 * Also validates YAML frontmatter schemas across all default templates.
 *
 * These tests invoke bash scripts directly (no Claude API calls).
 * Run with: npm run test:scripts
 */

let tmpDir;

function createTestProject(dir) {
  fs.mkdirSync(path.join(dir, '.planning', 'templates'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.planning', 'phases'), { recursive: true });
}

function copySkills(dir) {
  // Copy built plugin skills into test project
  const destSkills = path.join(dir, 'skills');
  fs.cpSync(SKILLS_DIR, destSkills, { recursive: true });
  // Make all scripts executable
  const scripts = execSync(`find "${destSkills}" -name "*.sh" -type f`, {
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);
  for (const script of scripts) {
    fs.chmodSync(script, 0o755);
  }
  return destSkills;
}

// Sample override content with required frontmatter fields in body
const SUMMARY_OVERRIDE = `---
kata_template:
  name: "Custom Summary"
  version: 2
  required:
    frontmatter: [phase, plan, subsystem, tags, duration, completed]
    body: [Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made]
---

# Custom Summary Template

\`\`\`markdown
---
phase: XX-name
plan: YY
subsystem: category
tags: [tag1]
duration: Xmin
completed: YYYY-MM-DD
---

## Performance
Duration info here

## Accomplishments
What was done

## Task Commits
Commit list

## Files Created/Modified
File list

## Decisions Made
Key decisions
\`\`\`
`;

// Override missing a required body section (Decisions Made)
const DRIFTED_OVERRIDE = `---
kata_template:
  name: "Drifted Summary"
  version: 2
  required:
    frontmatter: [phase, plan, subsystem, tags, duration, completed]
    body: [Performance, Accomplishments, Task Commits, Files Created/Modified, Decisions Made]
---

# Drifted Summary

\`\`\`markdown
---
phase: XX
plan: YY
subsystem: cat
tags: [t]
duration: 1min
completed: 2025-01-01
---

## Performance
Info

## Accomplishments
Done

## Task Commits
Commits

## Files Created/Modified
Files
\`\`\`
`;

describe('Template System', () => {
  before(() => {
    // Ensure plugin is built
    if (!fs.existsSync(SKILLS_DIR)) {
      execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
    }
  });

  describe('resolve-template.sh', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-tmpl-test-'));
      createTestProject(tmpDir);
      copySkills(tmpDir);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('finds override from project root', () => {
      // Create override file
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        SUMMARY_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-execute-phase/scripts/resolve-template.sh');
      const result = execSync(`bash "${script}" summary-template.md`, {
        cwd: tmpDir,
        encoding: 'utf8'
      }).trim();

      assert.ok(
        result.endsWith('.planning/templates/summary-template.md'),
        `Expected project override path, got: ${result}`
      );
    });

    test('finds override from skill subdirectory', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        SUMMARY_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-execute-phase/scripts/resolve-template.sh');
      // Run from a skill subdirectory
      const skillSubdir = path.join(tmpDir, 'skills/kata-execute-phase/scripts');
      const result = execSync(`bash "${script}" summary-template.md`, {
        cwd: skillSubdir,
        encoding: 'utf8'
      }).trim();

      assert.ok(
        result.endsWith('.planning/templates/summary-template.md'),
        `Expected project override from subdirectory, got: ${result}`
      );
    });

    test('falls back to default when no override', () => {
      const script = path.join(tmpDir, 'skills/kata-execute-phase/scripts/resolve-template.sh');
      const result = execSync(`bash "${script}" summary-template.md`, {
        cwd: tmpDir,
        encoding: 'utf8'
      }).trim();

      assert.ok(
        result.includes('skills/kata-execute-phase/references/summary-template.md'),
        `Expected sibling skill fallback path, got: ${result}`
      );
    });

    test('exits 1 with search paths for nonexistent template', () => {
      const script = path.join(tmpDir, 'skills/kata-execute-phase/scripts/resolve-template.sh');

      try {
        execSync(`bash "${script}" nonexistent-template.md`, {
          cwd: tmpDir,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        assert.fail('Should have exited with code 1');
      } catch (err) {
        assert.strictEqual(err.status, 1, 'Exit code should be 1');
        const stderr = err.stderr.toString();
        assert.ok(
          stderr.includes('Template not found'),
          `Stderr should include "Template not found", got: ${stderr}`
        );
        assert.ok(
          stderr.includes('Searched:'),
          `Stderr should include search paths, got: ${stderr}`
        );
      }
    });
  });

  describe('list-templates.sh', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-tmpl-test-'));
      createTestProject(tmpDir);
      copySkills(tmpDir);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('returns all 5 templates from project root', () => {
      const script = path.join(tmpDir, 'skills/kata-customize/scripts/list-templates.sh');
      const result = execSync(`bash "${script}"`, {
        cwd: tmpDir,
        encoding: 'utf8'
      });

      const templates = JSON.parse(result);
      assert.ok(Array.isArray(templates), 'Output should be a JSON array');
      assert.strictEqual(
        templates.length,
        5,
        `Expected 5 templates, got ${templates.length}: ${templates.map(t => t.filename).join(', ')}`
      );

      const filenames = templates.map(t => t.filename).sort();
      assert.deepStrictEqual(filenames, [
        'UAT-template.md',
        'changelog-entry.md',
        'plan-template.md',
        'summary-template.md',
        'verification-report.md'
      ]);
    });

    test('detects override files from project root', () => {
      // Create an override
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        SUMMARY_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-customize/scripts/list-templates.sh');
      const result = execSync(`bash "${script}"`, {
        cwd: tmpDir,
        encoding: 'utf8'
      });

      const templates = JSON.parse(result);
      const summaryTemplate = templates.find(t => t.filename === 'summary-template.md');
      assert.ok(summaryTemplate, 'Should find summary-template.md');
      assert.strictEqual(summaryTemplate.hasOverride, true, 'Should detect override');

      // Others should not have overrides
      const others = templates.filter(t => t.filename !== 'summary-template.md');
      for (const t of others) {
        assert.strictEqual(t.hasOverride, false, `${t.filename} should not have override`);
      }
    });

    test('works from skill subdirectory', () => {
      const script = path.join(tmpDir, 'skills/kata-customize/scripts/list-templates.sh');
      const skillSubdir = path.join(tmpDir, 'skills/kata-customize/scripts');
      const result = execSync(`bash "${script}"`, {
        cwd: skillSubdir,
        encoding: 'utf8'
      });

      const templates = JSON.parse(result);
      assert.ok(Array.isArray(templates), 'Output should be a JSON array');
      assert.strictEqual(templates.length, 5, `Expected 5 templates from subdirectory`);
    });
  });

  describe('check-template-drift.sh', () => {
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kata-tmpl-test-'));
      createTestProject(tmpDir);
      copySkills(tmpDir);
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('exits 0 with no output when overrides are valid (project root)', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        SUMMARY_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-doctor/scripts/check-template-drift.sh');
      const result = execSync(`bash "${script}"`, {
        cwd: tmpDir,
        encoding: 'utf8'
      });

      assert.strictEqual(result.trim(), '', 'Valid override should produce no output');
    });

    test('exits 0 with no output from skill subdirectory', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        SUMMARY_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-doctor/scripts/check-template-drift.sh');
      const skillSubdir = path.join(tmpDir, 'skills/kata-doctor/scripts');
      const result = execSync(`bash "${script}"`, {
        cwd: skillSubdir,
        encoding: 'utf8'
      });

      assert.strictEqual(result.trim(), '', 'Valid override from subdirectory should produce no output');
    });

    test('reports missing fields when override has drift', () => {
      fs.writeFileSync(
        path.join(tmpDir, '.planning/templates/summary-template.md'),
        DRIFTED_OVERRIDE
      );

      const script = path.join(tmpDir, 'skills/kata-doctor/scripts/check-template-drift.sh');
      const result = execSync(`bash "${script}"`, {
        cwd: tmpDir,
        encoding: 'utf8'
      });

      assert.ok(
        result.includes('Template drift'),
        `Should report template drift, got: ${result}`
      );
      assert.ok(
        result.includes('Decisions Made'),
        `Should report missing "Decisions Made" section, got: ${result}`
      );
    });
  });

  describe('YAML frontmatter', () => {
    test('all 5 default templates have valid kata_template schema', () => {
      const templateFiles = [
        path.join(SKILLS_DIR, 'kata-execute-phase/references/summary-template.md'),
        path.join(SKILLS_DIR, 'kata-plan-phase/references/plan-template.md'),
        path.join(SKILLS_DIR, 'kata-verify-work/references/UAT-template.md'),
        path.join(SKILLS_DIR, 'kata-verify-work/references/verification-report.md'),
        path.join(SKILLS_DIR, 'kata-complete-milestone/references/changelog-entry.md')
      ];

      for (const file of templateFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        const basename = path.basename(file);

        assert.ok(fmMatch, `${basename}: Should have YAML frontmatter`);

        const fm = fmMatch[1];
        assert.ok(
          fm.includes('kata_template:'),
          `${basename}: Frontmatter should contain kata_template key`
        );
        assert.ok(
          fm.includes('name:'),
          `${basename}: kata_template should have name field`
        );
        assert.ok(
          fm.includes('version:'),
          `${basename}: kata_template should have version field`
        );
      }
    });

    test('all 5 default templates are version 2', () => {
      const templateFiles = [
        path.join(SKILLS_DIR, 'kata-execute-phase/references/summary-template.md'),
        path.join(SKILLS_DIR, 'kata-plan-phase/references/plan-template.md'),
        path.join(SKILLS_DIR, 'kata-verify-work/references/UAT-template.md'),
        path.join(SKILLS_DIR, 'kata-verify-work/references/verification-report.md'),
        path.join(SKILLS_DIR, 'kata-complete-milestone/references/changelog-entry.md')
      ];

      for (const file of templateFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        const basename = path.basename(file);

        assert.ok(fmMatch, `${basename}: Should have frontmatter`);

        const fm = fmMatch[1];
        const versionMatch = fm.match(/version:\s*(\d+)/);
        assert.ok(versionMatch, `${basename}: Should have version field`);
        assert.strictEqual(
          parseInt(versionMatch[1]),
          2,
          `${basename}: Version should be 2, got ${versionMatch[1]}`
        );
      }
    });
  });
});
