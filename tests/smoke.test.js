import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const TEST_DIR = path.join(os.tmpdir(), `kata-smoke-test-${Date.now()}`);

/**
 * Post-release smoke tests for Plugin distribution.
 *
 * NPX distribution was deprecated in v1.1.0.
 * Plugin is now the only supported distribution method.
 *
 * Run with:
 *   npm run test:smoke
 */

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
    const skillPath = path.join(ROOT, 'dist/plugin/skills/execute-phase/SKILL.md');
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
    const skillPath = path.join(ROOT, 'dist/plugin/skills/execute-phase/SKILL.md');
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
