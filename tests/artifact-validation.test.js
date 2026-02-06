import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PLUGIN_DIR = path.join(ROOT, 'dist/plugin');

/**
 * Artifact Validation Test Suite
 *
 * Validates the built plugin artifacts in dist/plugin/.
 * These tests run AFTER build and verify what users actually install.
 *
 * Sections:
 * 1. Structure validation - directories, VERSION, plugin.json
 * 2. Path transformation validation - subagent_type, no stale patterns
 * 3. Reference resolution validation - @./references/ paths exist
 * 4. Frontmatter validation - skills have required fields
 */

/**
 * Recursively scan directory for files matching a pattern
 */
function findFiles(dir, pattern, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findFiles(fullPath, pattern, files);
    } else if (pattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const frontmatter = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      frontmatter[key] = value;
    }
  }
  return frontmatter;
}

/**
 * Extract @-references from content
 */
function extractReferences(content) {
  const refs = [];
  // Match @./... references (relative paths in plugin)
  const pattern = /@\.[^\s\n<>`"'()]+/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    refs.push(match[0]);
  }
  return refs;
}

describe('Artifact Validation: Structure', () => {
  before(() => {
    // Ensure plugin is built before running tests
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  test('dist/plugin/ directory exists', () => {
    assert.ok(fs.existsSync(PLUGIN_DIR), 'dist/plugin/ should exist');
  });

  test('required directories exist', () => {
    // Note: commands removed in v1.3.5 (skills-first architecture)
    // Note: agents removed in v1.6.0 (instructions moved to skill references/)
    const requiredDirs = ['.claude-plugin', 'skills', 'hooks'];
    const missing = [];

    for (const dir of requiredDirs) {
      const dirPath = path.join(PLUGIN_DIR, dir);
      if (!fs.existsSync(dirPath)) {
        missing.push(dir);
      }
    }

    assert.strictEqual(
      missing.length,
      0,
      `Missing required directories: ${missing.join(', ')}`
    );
  });

  test('VERSION file exists and matches package.json', () => {
    const versionPath = path.join(PLUGIN_DIR, 'VERSION');
    assert.ok(fs.existsSync(versionPath), 'VERSION file should exist');

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const version = fs.readFileSync(versionPath, 'utf8').trim();
    assert.strictEqual(
      version,
      pkg.version,
      `VERSION (${version}) should match package.json (${pkg.version})`
    );
  });

  test('plugin.json exists with name, version, description', () => {
    const pluginJsonPath = path.join(PLUGIN_DIR, '.claude-plugin/plugin.json');
    assert.ok(fs.existsSync(pluginJsonPath), 'plugin.json should exist');

    const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
    assert.ok(pluginJson.name, 'plugin.json should have name');
    assert.ok(pluginJson.version, 'plugin.json should have version');
    assert.ok(pluginJson.description, 'plugin.json should have description');
  });
});

describe('Artifact Validation: Path Transformations', () => {
  test('all Kata subagent_type attributes have kata: prefix', () => {
    const mdFiles = findFiles(PLUGIN_DIR, /\.md$/);
    const errors = [];

    for (const file of mdFiles) {
      // Skip CHANGELOG.md which contains historical documentation about the pattern
      if (path.basename(file) === 'CHANGELOG.md') continue;

      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(PLUGIN_DIR, file);

      // Find Kata subagent_type attributes without kata: prefix
      // Valid: subagent_type="kata:kata-planner"
      // Invalid: subagent_type="kata-planner"
      // Allowed without prefix: built-in Claude Code agents (general-purpose, Explore, Plan, etc.)
      const pattern = /subagent_type="([^"]+)"/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const value = match[1];
        // Only check Kata agents (those starting with kata-)
        // Built-in agents (general-purpose, Explore, Plan) don't need kata: prefix
        if (value.startsWith('kata-') && !value.startsWith('kata:kata-')) {
          errors.push(`${relativePath}: subagent_type="${value}" missing kata: prefix (should be kata:${value})`);
        }
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Kata subagent_type attributes without kata: prefix:\n${errors.join('\n')}`
    );
  });

  test('no @~/.claude/ references in plugin (except CHANGELOG.md)', () => {
    const mdFiles = findFiles(PLUGIN_DIR, /\.md$/);
    const errors = [];

    for (const file of mdFiles) {
      // Skip CHANGELOG.md which contains historical documentation
      if (path.basename(file) === 'CHANGELOG.md') continue;

      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(PLUGIN_DIR, file);

      if (content.includes('@~/.claude/')) {
        errors.push(`${relativePath}: contains @~/.claude/ reference`);
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Stale @~/.claude/ references found:\n${errors.join('\n')}`
    );
  });

  test('no @$KATA_BASE/ patterns (Claude cannot substitute variables)', () => {
    const mdFiles = findFiles(PLUGIN_DIR, /\.md$/);
    const errors = [];

    for (const file of mdFiles) {
      // Skip CHANGELOG.md which documents the failed @$KATA_BASE/ approach
      if (path.basename(file) === 'CHANGELOG.md') continue;

      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(PLUGIN_DIR, file);

      // Match @$VARIABLE/ patterns
      const badPattern = /@\$[A-Z_]+\//g;
      const matches = content.match(badPattern) || [];

      for (const match of matches) {
        errors.push(`${relativePath}: contains ${match} (Claude cannot substitute variables)`);
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Invalid @$VARIABLE/ patterns found:\n${errors.join('\n')}`
    );
  });

  test('no @${VAR}/ syntax in plugin (outside code blocks)', () => {
    const mdFiles = findFiles(PLUGIN_DIR, /\.md$/);
    const errors = [];

    for (const file of mdFiles) {
      if (path.basename(file) === 'CHANGELOG.md') continue;

      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(PLUGIN_DIR, file);

      // Remove code blocks - variables inside are dynamically constructed
      const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

      // Match @${...}/ patterns outside code blocks
      const badPattern = /@\$\{[^}]+\}\//g;
      const matches = contentWithoutCodeBlocks.match(badPattern) || [];

      for (const match of matches) {
        errors.push(`${relativePath}: contains ${match} (Claude cannot substitute variables)`);
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Invalid @\${VAR}/ patterns found:\n${errors.join('\n')}`
    );
  });
});

describe('Artifact Validation: Reference Resolution', () => {
  test('@./references/ paths in skills resolve to existing files', () => {
    const skillsDir = path.join(PLUGIN_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) {
      assert.fail('skills directory not found in plugin');
      return;
    }

    const errors = [];

    // Check each skill directory
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const skillName of skillDirs) {
      const skillDir = path.join(skillsDir, skillName);
      const skillMdFiles = findFiles(skillDir, /\.md$/);

      for (const file of skillMdFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const refs = extractReferences(content);
        const relativePath = path.relative(PLUGIN_DIR, file);
        const fileDir = path.dirname(file);

        for (const ref of refs) {
          // Skip @.planning/ references (project-local, not part of plugin)
          if (ref.startsWith('@.planning/')) continue;

          // Remove @ prefix and resolve relative to file's directory
          const refPath = ref.substring(2); // Remove @.
          const fullPath = path.join(fileDir, refPath);

          if (!fs.existsSync(fullPath)) {
            errors.push(`${relativePath}: @./${refPath} does not exist`);
          }
        }
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Broken @./references/ paths in skills:\n${errors.join('\n')}`
    );
  });

  // Note: agents directory removed in v1.6.0 (instructions moved to skill references/)
});

describe('Artifact Validation: Frontmatter', () => {
  test('all SKILL.md files have name and description in frontmatter', () => {
    const skillsDir = path.join(PLUGIN_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) {
      assert.fail('skills directory not found in plugin');
      return;
    }

    const skillFiles = findFiles(skillsDir, /^SKILL\.md$/);
    const errors = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativePath = path.relative(PLUGIN_DIR, file);

      if (!frontmatter) {
        errors.push(`${relativePath}: Missing frontmatter`);
        continue;
      }

      if (!frontmatter.name) {
        errors.push(`${relativePath}: Missing 'name' in frontmatter`);
      }
      if (!frontmatter.description) {
        errors.push(`${relativePath}: Missing 'description' in frontmatter`);
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `SKILL.md frontmatter errors:\n${errors.join('\n')}`
    );
  });

  // Note: agent frontmatter test removed in v1.6.0 (agents directory removed)

  test('skill descriptions are meaningful (>= 10 chars)', () => {
    const skillsDir = path.join(PLUGIN_DIR, 'skills');
    if (!fs.existsSync(skillsDir)) return;

    const skillFiles = findFiles(skillsDir, /^SKILL\.md$/);
    const errors = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativePath = path.relative(PLUGIN_DIR, file);

      if (frontmatter && frontmatter.description) {
        const desc = frontmatter.description.replace(/^["']|["']$/g, '');
        if (desc.length < 10) {
          errors.push(`${relativePath}: Description too short (${desc.length} chars)`);
        }
      }
    }

    assert.strictEqual(
      errors.length,
      0,
      `Skill description length errors:\n${errors.join('\n')}`
    );
  });
});
