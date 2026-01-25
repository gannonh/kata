import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const TEST_DIR = path.join(os.tmpdir(), `kata-smoke-test-${Date.now()}`);

/**
 * Post-release smoke tests for NPX and Plugin distributions.
 *
 * These tests verify that published distributions install correctly
 * and contain all required files.
 *
 * Run after a release with:
 *   KATA_VERSION=1.0.1 npm run test:smoke
 *
 * Or for local builds:
 *   npm run test:smoke
 */

const KATA_VERSION = process.env.KATA_VERSION || null;

describe('NPX Install Smoke Test', () => {
  const npxTestDir = path.join(TEST_DIR, 'npx-test');

  before(() => {
    fs.mkdirSync(npxTestDir, { recursive: true });
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  test('npx install creates .claude directory', () => {
    const pkg = KATA_VERSION ? `@gannonh/kata@${KATA_VERSION}` : path.join(ROOT, 'dist/npm');

    // Run npx install (or local install for dev)
    if (KATA_VERSION) {
      execSync(`npx ${pkg} --local`, { cwd: npxTestDir, stdio: 'pipe' });
    } else {
      // For local testing, use the installer directly
      execSync(`node ${path.join(ROOT, 'bin/install.js')} --local`, {
        cwd: npxTestDir,
        stdio: 'pipe'
      });
    }

    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude')),
      '.claude directory should be created'
    );
  });

  test('install creates kata directory', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/kata')),
      '.claude/kata directory should exist'
    );
  });

  test('install creates agents directory', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/agents')),
      '.claude/agents directory should exist'
    );
  });

  test('install creates skills directory', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/skills')),
      '.claude/skills directory should exist'
    );
  });

  test('install creates commands directory', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/commands')),
      '.claude/commands directory should exist for autocomplete'
    );
  });

  test('install creates hooks directory', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/hooks')),
      '.claude/hooks directory should exist'
    );
  });

  test('VERSION file exists', () => {
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/kata/VERSION')),
      '.claude/kata/VERSION should exist'
    );
  });

  test('VERSION file matches expected version', () => {
    const versionFile = path.join(npxTestDir, '.claude/kata/VERSION');
    const installedVersion = fs.readFileSync(versionFile, 'utf8').trim();

    if (KATA_VERSION) {
      assert.strictEqual(
        installedVersion,
        KATA_VERSION,
        `VERSION should be ${KATA_VERSION}, got ${installedVersion}`
      );
    } else {
      // For local testing, just verify it's a valid semver
      assert.match(
        installedVersion,
        /^\d+\.\d+\.\d+/,
        'VERSION should be valid semver'
      );
    }
  });

  test('providing-help skill exists (replaces kata:help command)', () => {
    // Phase 2.2: Commands removed, skills are the primary interface
    assert.ok(
      fs.existsSync(path.join(npxTestDir, '.claude/skills/kata-providing-help/SKILL.md')),
      'kata-providing-help skill should exist'
    );
  });

  test('skills have correct path references for NPM install (Phase 2.1)', () => {
    const skillPath = path.join(npxTestDir, '.claude/skills/kata-executing-phases/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      // Phase 2.1: Skills are self-contained with local @./references/ paths
      // Skills reference their own references/ subdirectory, not a shared kata/ directory
      assert.ok(
        content.includes('@./') && !content.includes('@~/.claude/kata/'),
        'NPM install skills should use local @./ references (not shared @~/.claude/kata/)'
      );
      assert.ok(
        !content.includes('@$KATA_BASE/'),
        'Skill should NOT have @$KATA_BASE/ references (Claude cannot substitute variables)'
      );
    }
  });
});

describe('Plugin Build Smoke Test', () => {
  // Plugin installation requires Claude Code interactive commands
  // We can only verify the build output here

  before(() => {
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  test('plugin build creates dist/plugin directory', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'dist/plugin')),
      'dist/plugin should exist'
    );
  });

  test('plugin.json exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'dist/plugin/.claude-plugin/plugin.json')),
      'plugin.json should exist'
    );
  });

  test('plugin.json has valid structure', () => {
    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'dist/plugin/.claude-plugin/plugin.json'), 'utf8')
    );

    assert.ok(pluginJson.name, 'plugin.json should have name');
    assert.ok(pluginJson.version, 'plugin.json should have version');
    assert.ok(pluginJson.description, 'plugin.json should have description');
  });

  test('plugin VERSION file exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'dist/plugin/VERSION')),
      'VERSION should exist in plugin build'
    );
  });

  test('plugin skills have local references (Phase 2.1)', () => {
    const skillPath = path.join(ROOT, 'dist/plugin/skills/kata-executing-phases/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      // Phase 2.1: Skills are self-contained with local @./references/ paths
      // No shared kata/ directory - skills reference their own references/ subdirectory
      assert.ok(
        !content.includes('@~/.claude/kata/'),
        'Plugin skills should NOT have hardcoded ~/.claude/kata/ paths'
      );
      assert.ok(
        !content.includes('@$KATA_BASE/'),
        'Plugin skills should NOT have @$KATA_BASE/ (Claude cannot substitute variables)'
      );
      // Skills use @./references/ for their own local references, or @./workflows/, @./kata/
      assert.ok(
        content.includes('@./'),
        'Plugin skills should have local @./ references'
      );
    }
  });

  test('no stale ~/.claude/ references in plugin build', () => {
    const pluginDir = path.join(ROOT, 'dist/plugin');
    // Exclude CHANGELOG.md which documents historical path transformation (not actual code)
    const result = spawnSync('grep', ['-r', '--exclude=CHANGELOG.md', '@~/.claude/', pluginDir], {
      encoding: 'utf8'
    });

    assert.strictEqual(
      result.stdout.trim(),
      '',
      `Plugin build should not contain ~/.claude/ references: ${result.stdout}`
    );
  });

  test('no $KATA_BASE in plugin @ references', () => {
    const pluginDir = path.join(ROOT, 'dist/plugin');
    // Exclude CHANGELOG.md which documents the failed @$KATA_BASE/ approach (not actual code)
    const result = spawnSync('grep', ['-r', '--exclude=CHANGELOG.md', '@\\$KATA_BASE/', pluginDir], {
      encoding: 'utf8'
    });

    assert.strictEqual(
      result.stdout.trim(),
      '',
      `Plugin build should not contain @$KATA_BASE/ references (Claude cannot substitute variables): ${result.stdout}`
    );
  });

  test('plugin @ references resolve to existing files (Phase 2.1)', () => {
    // Extract all @ references from a sample skill and verify they exist
    // Phase 2.1: Skills use @./references/ paths relative to each skill's directory
    const skillPath = path.join(ROOT, 'dist/plugin/skills/kata-executing-phases/SKILL.md');
    const skillDir = path.dirname(skillPath);
    if (!fs.existsSync(skillPath)) return;

    const content = fs.readFileSync(skillPath, 'utf8');
    // Match @./... references
    const refs = content.match(/@\.[^\s\n<>`"'()]+/g) || [];
    const errors = [];

    for (const ref of refs) {
      // Skip @.planning/ references (project-local, not part of plugin)
      if (ref.startsWith('@.planning/')) continue;

      const relativePath = ref.substring(2); // Remove @.
      // Resolve relative to skill's directory (Phase 2.1 - skills are self-contained)
      const fullPath = path.join(skillDir, relativePath);

      if (!fs.existsSync(fullPath)) {
        errors.push(`@ reference not found: ${ref} (expected at ${fullPath})`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Broken @ references in plugin:\n${errors.join('\n')}`);
    }
  });
});

describe('Claude CLI Integration', { skip: !process.env.TEST_CLI }, () => {
  // These tests require Claude CLI and are opt-in via TEST_CLI=1
  const cliTestDir = path.join(TEST_DIR, 'cli-test');

  before(() => {
    fs.mkdirSync(cliTestDir, { recursive: true });
    execSync(`node ${path.join(ROOT, 'bin/install.js')} --local`, {
      cwd: cliTestDir,
      stdio: 'pipe'
    });
  });

  test('claude --print with kata:help executes successfully', () => {
    try {
      const result = execSync(
        'claude --print "Run /kata:help and summarize what commands are available"',
        {
          cwd: cliTestDir,
          encoding: 'utf8',
          timeout: 60000
        }
      );

      assert.ok(
        result.includes('kata') || result.includes('phase') || result.includes('project'),
        'Claude should respond with kata-related content'
      );
    } catch (err) {
      // Claude CLI might not be installed - skip gracefully
      if (err.message.includes('command not found') || err.message.includes('ENOENT')) {
        console.log('Skipping: Claude CLI not available');
        return;
      }
      throw err;
    }
  });
});
