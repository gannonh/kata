import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

describe('NPM build', () => {
  before(() => {
    execSync('npm run build:npm', { cwd: ROOT, stdio: 'pipe' });
  });

  test('creates dist/npm directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm')));
  });

  test('includes bin/install.js', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/bin/install.js')));
  });

  test('includes package.json', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/package.json')));
  });

  test('includes commands directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/commands')));
  });

  test('includes skills directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/skills')));
  });

  test('includes hooks directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/hooks')));
  });

  test('does NOT include shared kata directory (Phase 2.1 restructure)', () => {
    // After Phase 2.1, shared kata/ directory is removed
    // Skills now have self-contained references/ subdirectories
    assert.ok(!fs.existsSync(path.join(ROOT, 'dist/npm/kata')));
  });

  test('includes agents directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/npm/agents')));
  });

  test('skills use local @./references/ paths (Phase 2.1 restructure)', () => {
    const skillPath = path.join(ROOT, 'dist/npm/skills/kata-executing-phases/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      // After Phase 2.1, skills use local @./references/ paths
      // Skills are self-contained with bundled resources
      assert.ok(
        content.includes('@./references/'),
        'NPM skills should use @./references/ paths (self-contained)'
      );
      assert.ok(
        !content.includes('@~/.claude/kata/'),
        'NPM skills should NOT use @~/.claude/kata/ (old shared path)'
      );
      assert.ok(
        !content.includes('@$KATA_BASE/'),
        'NPM skills should NOT use @$KATA_BASE/ (Claude cannot substitute variables)'
      );
    }
  });

  test('package.json has correct name', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/npm/package.json'), 'utf8'));
    assert.strictEqual(pkg.name, '@gannonh/kata');
  });
});

describe('Plugin build', () => {
  before(() => {
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  test('creates dist/plugin directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin')));
  });

  test('includes .claude-plugin/plugin.json', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin/.claude-plugin/plugin.json')));
  });

  test('includes commands directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin/commands')));
  });

  test('includes skills directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin/skills')));
  });

  test('includes hooks directory', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin/hooks')));
  });

  test('does NOT include shared kata directory (Phase 2.1 restructure)', () => {
    // After Phase 2.1, shared kata/ directory is removed
    // Skills now have self-contained references/ subdirectories
    assert.ok(!fs.existsSync(path.join(ROOT, 'dist/plugin/kata')));
  });

  test('includes VERSION file', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/plugin/VERSION')));
  });

  test('skills reference ./kata/ paths (not ~/.claude/)', () => {
    const skillPath = path.join(ROOT, 'dist/plugin/skills/kata-executing-phases/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      assert.ok(
        !content.includes('@~/.claude/kata/'),
        'Plugin skills should NOT reference ~/.claude/kata/ paths'
      );
    }
  });

  test('no ~/.claude/ references in plugin distribution (excluding CHANGELOG)', () => {
    // CHANGELOG.md contains historical documentation about old path patterns
    const result = execSync(
      'grep -r "@~/.claude/" dist/plugin/ --include="*.md" 2>/dev/null | grep -v CHANGELOG.md || true',
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.strictEqual(result.trim(), '', 'Plugin should not have ~/.claude/ references');
  });

  test('plugin skills use local @./references/ pattern', () => {
    // After Phase 2.1 restructure, skills use @./references/ for local resources
    // Skills no longer reference shared @./kata/ directory
    const skillPath = path.join(ROOT, 'dist/plugin/skills/kata-executing-phases/SKILL.md');
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf8');
      // Find all @./... references (excluding @.planning/ which is project-local)
      const refs = content.match(/@\.\/(references\/)?[^\s\n<>`"'()]+/g) || [];
      for (const ref of refs) {
        // Skip @.planning/ references (project-local, not part of plugin)
        if (ref.startsWith('@.planning/')) continue;
        // Skill references should be @./references/ (local to skill directory)
        assert.ok(
          ref.startsWith('@./references/'),
          `Skill reference should be @./references/..., got: ${ref}`
        );
      }
    }
  });

  test('plugin agents have transformed paths', () => {
    const agentPath = path.join(ROOT, 'dist/plugin/agents/kata-executor.md');
    if (fs.existsSync(agentPath)) {
      const content = fs.readFileSync(agentPath, 'utf8');
      assert.ok(
        !content.includes('@~/.claude/kata/'),
        'Plugin agents should NOT have ~/.claude/kata/ paths'
      );
      // If it has kata/ references, they should be @./kata/
      if (content.includes('@./kata/') || content.includes('kata/references/')) {
        assert.ok(
          content.includes('@./kata/'),
          'Plugin agents should use @./kata/ for resource references'
        );
      }
    }
  });

  test('plugin workflows have transformed paths', () => {
    const workflowPath = path.join(ROOT, 'dist/plugin/kata/workflows/phase-execute.md');
    if (fs.existsSync(workflowPath)) {
      const content = fs.readFileSync(workflowPath, 'utf8');
      assert.ok(
        !content.includes('@~/.claude/kata/'),
        'Plugin workflows should NOT have ~/.claude/kata/ paths'
      );
    }
  });

  test('plugin.json has correct name', () => {
    const plugin = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'dist/plugin/.claude-plugin/plugin.json'), 'utf8')
    );
    assert.strictEqual(plugin.name, 'kata');
  });
});

describe('Version consistency', () => {
  test('package.json and plugin.json have same version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const plugin = JSON.parse(
      fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8')
    );
    assert.strictEqual(pkg.version, plugin.version,
      `Version mismatch: package.json=${pkg.version}, plugin.json=${plugin.version}`);
  });

  test('built plugin VERSION matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const versionFile = path.join(ROOT, 'dist/plugin/VERSION');
    if (fs.existsSync(versionFile)) {
      const version = fs.readFileSync(versionFile, 'utf8').trim();
      assert.strictEqual(version, pkg.version,
        `Plugin VERSION mismatch: ${version} vs package.json ${pkg.version}`);
    }
  });

  test('built npm VERSION matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const versionFile = path.join(ROOT, 'dist/npm/kata/VERSION');
    if (fs.existsSync(versionFile)) {
      const version = fs.readFileSync(versionFile, 'utf8').trim();
      assert.strictEqual(version, pkg.version,
        `NPM VERSION mismatch: ${version} vs package.json ${pkg.version}`);
    }
  });
});

describe('No stale references', () => {
  test('no kata-cc references in source', () => {
    const result = execSync(
      'grep -r "kata-cc" skills/ kata/ agents/ 2>/dev/null || true',
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.strictEqual(result.trim(), '', 'Should not have stale kata-cc references');
  });

  test('no GSD references in source', () => {
    const result = execSync(
      'grep -ri "get-shit-done\\|glittercowboy/gsd" skills/ kata/ agents/ 2>/dev/null || true',
      { cwd: ROOT, encoding: 'utf8' }
    );
    // Allow references in README or historical docs, but not in functional code
    const lines = result.trim().split('\n').filter(l => l && !l.includes('README') && !l.includes('CHANGELOG'));
    assert.strictEqual(lines.length, 0, 'Should not have stale GSD references in functional code');
  });
});

describe('Skill structure (Phase 2.2)', () => {
  test('all skills have kata- prefix in directory name', () => {
    const skillsDir = path.join(ROOT, 'skills');
    if (fs.existsSync(skillsDir)) {
      const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
      for (const dir of skillDirs) {
        assert.ok(
          dir.startsWith('kata-'),
          `Skill directory ${dir} should have kata- prefix`
        );
      }
    }
  });
});

describe('Hook scripts', () => {
  test('hooks use ES module syntax', () => {
    const hooksDir = path.join(ROOT, 'hooks');
    if (fs.existsSync(hooksDir)) {
      const jsFiles = fs.readdirSync(hooksDir).filter(f => f.endsWith('.js'));
      for (const file of jsFiles) {
        const content = fs.readFileSync(path.join(hooksDir, file), 'utf8');
        // Check for ESM patterns (import/export) or lack of CommonJS patterns
        const hasESM = content.includes('import ') || content.includes('export ');
        const hasCJS = content.includes('require(') || content.includes('module.exports');
        if (hasCJS && !hasESM) {
          assert.fail(`Hook ${file} uses CommonJS but should use ES modules`);
        }
      }
    }
  });
});

describe('Skill frontmatter validation', () => {
  /**
   * Recursively find all SKILL.md files
   */
  function findSkillFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findSkillFiles(fullPath, files);
      } else if (entry.name === 'SKILL.md') {
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

  test('all skills have description in frontmatter', () => {
    const skillsDir = path.join(ROOT, 'skills');
    const skillFiles = findSkillFiles(skillsDir);
    const errors = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativePath = path.relative(ROOT, file);

      if (!frontmatter) {
        errors.push(`${relativePath}: Missing frontmatter`);
        continue;
      }

      if (!frontmatter.description) {
        errors.push(`${relativePath}: Missing 'description' in frontmatter`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Skill frontmatter errors:\n${errors.join('\n')}`);
    }
  });

  test('skill descriptions are meaningful (not empty or too short)', () => {
    const skillsDir = path.join(ROOT, 'skills');
    const skillFiles = findSkillFiles(skillsDir);
    const errors = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const frontmatter = parseFrontmatter(content);
      const relativePath = path.relative(ROOT, file);

      if (frontmatter && frontmatter.description) {
        const desc = frontmatter.description.replace(/^["']|["']$/g, '');
        if (desc.length < 10) {
          errors.push(`${relativePath}: Description too short (${desc.length} chars)`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Skill description errors:\n${errors.join('\n')}`);
    }
  });
});

describe('Agent file validation', () => {
  test('all agent files have description in frontmatter', () => {
    const agentsDir = path.join(ROOT, 'agents');
    if (!fs.existsSync(agentsDir)) return;

    const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    const errors = [];

    for (const file of agentFiles) {
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);

      if (!match) {
        errors.push(`${file}: Missing frontmatter`);
        continue;
      }

      if (!match[1].includes('description:')) {
        errors.push(`${file}: Missing 'description' in frontmatter`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Agent frontmatter errors:\n${errors.join('\n')}`);
    }
  });

});

describe('Workflow @-reference validation', () => {
  /**
   * Extract @-references from content
   * Stops at whitespace, newlines, backticks, quotes, and XML brackets
   */
  function extractReferences(content) {
    const refs = [];
    // Match @~/.claude/... or @./... references
    // Stop at whitespace, newlines, backticks, quotes, parentheses, XML brackets
    const patterns = [
      /@~\/\.claude\/[^\s\n<>`"'()]+/g,
      /@\.\/[^\s\n<>`"'()]+/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        refs.push(match[0]);
      }
    }
    return refs;
  }

  /**
   * Resolve a reference to a file path
   */
  function resolveRef(ref, baseDir = ROOT) {
    if (ref.startsWith('@~/.claude/')) {
      // For source validation, map to local path
      const relativePath = ref.replace('@~/.claude/', '');
      return path.join(ROOT, relativePath);
    } else if (ref.startsWith('@./')) {
      // Resolve relative to the file's directory
      const relativePath = ref.replace('@./', '');
      return path.join(baseDir, relativePath);
    }
    return null;
  }

  test('workflow @-references point to existing files', () => {
    const workflowsDir = path.join(ROOT, 'kata/workflows');
    if (!fs.existsSync(workflowsDir)) return;

    const workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md'));
    const errors = [];

    for (const file of workflowFiles) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      const refs = extractReferences(content);

      for (const ref of refs) {
        const resolved = resolveRef(ref);
        if (resolved && !fs.existsSync(resolved)) {
          errors.push(`${file}: Reference not found: ${ref}`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Broken @-references:\n${errors.join('\n')}`);
    }
  });

  test('skill @-references point to existing files', () => {
    const skillsDir = path.join(ROOT, 'skills');
    if (!fs.existsSync(skillsDir)) return;

    const errors = [];

    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const refs = extractReferences(content);
          const relativePath = path.relative(ROOT, fullPath);

          for (const ref of refs) {
            const fileDir = path.dirname(fullPath);
            const resolved = resolveRef(ref, fileDir);
            if (resolved && !fs.existsSync(resolved)) {
              errors.push(`${relativePath}: Reference not found: ${ref}`);
            }
          }
        }
      }
    }

    checkDir(skillsDir);

    if (errors.length > 0) {
      assert.fail(`Broken @-references in skills:\n${errors.join('\n')}`);
    }
  });

  test('template @-references point to existing files', () => {
    const templatesDir = path.join(ROOT, 'kata/templates');
    if (!fs.existsSync(templatesDir)) return;

    const templateFiles = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md'));
    const errors = [];

    for (const file of templateFiles) {
      const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
      const refs = extractReferences(content);

      for (const ref of refs) {
        const resolved = resolveRef(ref);
        if (resolved && !fs.existsSync(resolved)) {
          errors.push(`${file}: Reference not found: ${ref}`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Broken @-references in templates:\n${errors.join('\n')}`);
    }
  });
});

describe('Skill and command validation', () => {
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

  test('all skills are user-invocable', () => {
    // Phase 2.2: All skills must be user-invocable (no commands layer)
    const skillsDir = path.join(ROOT, 'skills');
    if (!fs.existsSync(skillsDir)) return;

    const errors = [];
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const dir of skillDirs) {
      const skillFile = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;

      const content = fs.readFileSync(skillFile, 'utf8');
      const frontmatter = parseFrontmatter(content);

      if (frontmatter && frontmatter['user-invocable'] === 'false') {
        errors.push(`${dir}: user-invocable should be true (not false)`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Non-user-invocable skills found:\n${errors.join('\n')}`);
    }
  });

  test('commands directory exists with kata subdirectory', () => {
    // Commands provide autocomplete in Claude Code /menu
    assert.ok(
      fs.existsSync(path.join(ROOT, 'commands/kata')),
      'commands/kata/ directory should exist for autocomplete support'
    );
  });
});

describe('@ Reference Path Validation', () => {
  /**
   * CRITICAL: Claude's @ reference system is a STATIC file path parser.
   * It does NOT support variable substitution like $KATA_BASE or ${VAR}.
   *
   * These tests ensure source files use the canonical @~/.claude/kata/ form,
   * which build.js transforms to @./kata/ for plugin builds.
   */

  /**
   * Recursively scan directory for markdown files
   */
  function scanMarkdownFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanMarkdownFiles(fullPath, files);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  test('no $KATA_BASE in @ references (Claude cannot substitute variables)', () => {
    // @ references must be static paths that build.js can transform
    // @$KATA_BASE/... will NEVER work - Claude treats it as literal path
    const dirsToCheck = ['agents', 'skills', 'kata/workflows', 'kata/templates'];
    const errors = [];

    for (const dir of dirsToCheck) {
      const files = scanMarkdownFiles(path.join(ROOT, dir));
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(ROOT, file);

        // Match @$VARIABLE/ patterns - these will never work
        const badPattern = /@\$[A-Z_]+\//g;
        const matches = content.match(badPattern) || [];

        for (const match of matches) {
          errors.push(`${relativePath}: Invalid @ reference: ${match} (Claude cannot substitute variables)`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Variable patterns in @ references will not work:\n${errors.join('\n')}`);
    }
  });

  test('no ${VAR} syntax in @ references', () => {
    // @${KATA_BASE}/... is also invalid
    // Exception: code blocks showing dynamic prompt construction (bash substitutes before Task call)
    const dirsToCheck = ['agents', 'skills', 'kata/workflows', 'kata/templates'];
    const errors = [];

    for (const dir of dirsToCheck) {
      const files = scanMarkdownFiles(path.join(ROOT, dir));
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(ROOT, file);

        // Remove code blocks - variables inside are dynamically constructed
        // (bash substitutes @${VAR}/ before Task tool receives the prompt)
        const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');

        // Match @${...}/ patterns outside code blocks
        const badPattern = /@\$\{[^}]+\}\//g;
        const matches = contentWithoutCodeBlocks.match(badPattern) || [];

        for (const match of matches) {
          errors.push(`${relativePath}: Invalid @ reference: ${match} (Claude cannot substitute variables)`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Variable patterns in @ references will not work:\n${errors.join('\n')}`);
    }
  });

  test('source files use canonical @~/.claude/kata/ pattern', () => {
    // Source files MUST use @~/.claude/kata/ for build.js to transform correctly
    // This is the canonical form that:
    // - Plugin build transforms to @./kata/
    // - NPM install.js transforms at runtime
    const dirsToCheck = ['agents', 'skills', 'kata/workflows', 'kata/templates'];
    const filesWithKataRefs = [];

    for (const dir of dirsToCheck) {
      const files = scanMarkdownFiles(path.join(ROOT, dir));
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');

        // Check if file has any kata-related @ references
        if (content.match(/@[^\s]*kata\//)) {
          filesWithKataRefs.push({
            path: path.relative(ROOT, file),
            content
          });
        }
      }
    }

    const errors = [];
    for (const { path: filePath, content } of filesWithKataRefs) {
      // Valid: @~/.claude/kata/
      // Invalid: @$KATA_BASE/, @./kata/ (in source), @${VAR}/

      // Skip bash file checks (not @ references)
      let checkContent = content;
      checkContent = checkContent.replace(/\[ -[fd] [^\]]+\]/g, '');
      checkContent = checkContent.replace(/cat [^\n]+\/kata\//g, '');

      // Find @ references to kata paths
      const kataRefs = checkContent.match(/@[^\s\n<>`"'()]*kata\/[^\s\n<>`"'()]+/g) || [];

      for (const ref of kataRefs) {
        if (!ref.startsWith('@~/.claude/kata/') && !ref.startsWith('@.planning/')) {
          errors.push(`${filePath}: Non-canonical @ reference: ${ref} (should use @~/.claude/kata/)`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Non-canonical @ references found:\n${errors.join('\n')}`);
    }
  });

  test('no <kata_path> blocks in source (deprecated pattern)', () => {
    // The <kata_path> block pattern was removed because it doesn't help with @ references
    // Claude's @ parser is static and cannot use bash-resolved variables
    const dirsToCheck = ['agents', 'skills', 'kata/workflows', 'kata/templates'];
    const errors = [];

    for (const dir of dirsToCheck) {
      const files = scanMarkdownFiles(path.join(ROOT, dir));
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const relativePath = path.relative(ROOT, file);

        if (content.includes('<kata_path>')) {
          errors.push(`${relativePath}: Contains deprecated <kata_path> block`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Deprecated <kata_path> blocks found:\n${errors.join('\n')}`);
    }
  });
});

describe('Circular dependency check', () => {
  /**
   * Extract @-references from content (workflow files only)
   */
  function extractWorkflowRefs(content) {
    const refs = [];
    const pattern = /@~\/\.claude\/kata\/workflows\/([^\s\n<>]+\.md)/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      refs.push(match[1]);
    }
    return refs;
  }

  test('no circular references in workflows', () => {
    const workflowsDir = path.join(ROOT, 'kata/workflows');
    if (!fs.existsSync(workflowsDir)) return;

    // Build dependency graph
    const graph = {};
    const workflowFiles = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md'));

    for (const file of workflowFiles) {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      const refs = extractWorkflowRefs(content);
      graph[file] = refs;
    }

    // Detect cycles using DFS
    function hasCycle(node, visited, recStack, path) {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const deps = graph[node] || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          const result = hasCycle(dep, visited, recStack, path);
          if (result) return result;
        } else if (recStack.has(dep)) {
          path.push(dep);
          return path.slice(path.indexOf(dep));
        }
      }

      path.pop();
      recStack.delete(node);
      return null;
    }

    for (const file of workflowFiles) {
      const cycle = hasCycle(file, new Set(), new Set(), []);
      if (cycle) {
        assert.fail(`Circular dependency detected: ${cycle.join(' -> ')}`);
      }
    }
  });

  test('no circular references in skills', () => {
    const skillsDir = path.join(ROOT, 'skills');
    if (!fs.existsSync(skillsDir)) return;

    // Build dependency graph for skills referencing other skills
    const graph = {};

    function findSkillRefs(dir, skillName) {
      const refs = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          refs.push(...findSkillRefs(fullPath, skillName));
        } else if (entry.name.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Look for skill references
          const pattern = /skills\/([^\/\s]+)\/SKILL\.md/g;
          let match;
          while ((match = pattern.exec(content)) !== null) {
            if (match[1] !== skillName) {
              refs.push(match[1]);
            }
          }
        }
      }
      return refs;
    }

    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    for (const skillName of skillDirs) {
      const skillDir = path.join(skillsDir, skillName);
      graph[skillName] = findSkillRefs(skillDir, skillName);
    }

    // Detect cycles using DFS
    function hasCycle(node, visited, recStack, path) {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const deps = graph[node] || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          const result = hasCycle(dep, visited, recStack, path);
          if (result) return result;
        } else if (recStack.has(dep)) {
          path.push(dep);
          return path.slice(path.indexOf(dep));
        }
      }

      path.pop();
      recStack.delete(node);
      return null;
    }

    for (const skillName of skillDirs) {
      const cycle = hasCycle(skillName, new Set(), new Set(), []);
      if (cycle) {
        assert.fail(`Circular skill dependency detected: ${cycle.join(' -> ')}`);
      }
    }
  });
});
