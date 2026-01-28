# Phase 0: Foundation & CI Hardening - Research

**Researched:** 2026-01-28
**Domain:** CI/CD, Plugin Build System, Integration Testing
**Confidence:** HIGH

## Summary

This research investigates how to harden CI to validate actual plugin artifacts and prevent path resolution failures like those seen in v1.0.3-1.0.8.

The core problem: Current tests run against SOURCE files, but users install BUILT artifacts from `dist/plugin/`. The build process performs transformations (agent subagent_type namespacing), and any failures in these transformations only surface after release.

**Primary recommendation:** Add a dedicated "artifact validation" test suite that runs AFTER the build step, testing the actual `dist/plugin/` contents as if Claude Code were loading them. This catches transformation errors before release.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
| ------- | ------- | ------- | ------------ |
| Node.js test runner | Built-in | Test framework | Zero deps, already in use, native ESM support |
| `node:assert` | Built-in | Assertions | Already in use, sufficient for validation tests |
| `node:fs` | Built-in | File system operations | Already used extensively in existing tests |

### Supporting
| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| `child_process` | Built-in | Run build scripts | Execute `npm run build:plugin` before artifact tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| ---------- | --------- | -------- |
| Node test runner | Jest/Vitest | More features but adds dependencies; overkill for file validation |
| Custom validation | JSON Schema validation | More rigid but slower to iterate; skill format evolves |

**Installation:**
```bash
# No additional dependencies needed - all built-in Node.js
```

## Architecture Patterns

### Recommended Test Structure
```
tests/
├── build.test.js         # Existing: validates build output structure
├── smoke.test.js         # Existing: plugin build smoke tests
├── artifact/             # NEW: post-build artifact validation
│   ├── path-transforms.test.js    # Verify @ references resolve
│   ├── skill-structure.test.js    # Validate SKILL.md integrity
│   └── agent-namespacing.test.js  # Verify subagent_type transforms
├── skills/               # Existing: skill invocation tests (use source)
│   └── *.test.js
└── harness/
    └── *.js              # Existing test utilities
```

### Pattern 1: Two-Phase Test Strategy

**What:** Separate "source validation" tests from "artifact validation" tests.

**When to use:** Any CI pipeline that builds before deploying.

**Example:**
```javascript
// tests/artifact/path-transforms.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_PLUGIN = path.join(ROOT, 'dist/plugin');

describe('Artifact path transforms', () => {
  before(() => {
    // Ensure fresh build before artifact tests
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  test('@./references/ paths resolve to existing files', () => {
    const skillsDir = path.join(DIST_PLUGIN, 'skills');
    const errors = [];

    function checkSkill(skillDir) {
      const skillMd = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) return;

      const content = fs.readFileSync(skillMd, 'utf8');
      // Match @./references/... patterns
      const refs = content.match(/@\.\/references\/[^\s\n<>`"'()]+/g) || [];

      for (const ref of refs) {
        const relativePath = ref.substring(2); // Remove @.
        const fullPath = path.join(skillDir, relativePath);
        if (!fs.existsSync(fullPath)) {
          errors.push(`${path.relative(DIST_PLUGIN, skillMd)}: ${ref} -> not found`);
        }
      }
    }

    // Check all skills
    for (const skill of fs.readdirSync(skillsDir)) {
      const skillDir = path.join(skillsDir, skill);
      if (fs.statSync(skillDir).isDirectory()) {
        checkSkill(skillDir);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Broken @ references in artifacts:\n${errors.join('\n')}`);
    }
  });
});
```

### Pattern 2: Agent Namespacing Validation

**What:** Verify `subagent_type="kata-xxx"` transformed to `subagent_type="kata:kata-xxx"` in built artifacts.

**When to use:** After build, before release.

**Example:**
```javascript
// tests/artifact/agent-namespacing.test.js
test('agent subagent_type attributes are namespaced for plugin', () => {
  const errors = [];

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        // Find subagent_type="kata-..." WITHOUT the kata: prefix (un-transformed)
        const untransformed = content.match(/subagent_type="kata-(?!kata:)[^"]+"/g) || [];
        // Note: Need to exclude subagent_type="kata:kata-..." which IS correct
        const actuallyBad = untransformed.filter(m => !m.includes('kata:kata-'));

        for (const match of actuallyBad) {
          errors.push(`${path.relative(DIST_PLUGIN, fullPath)}: ${match} should be kata:kata-...`);
        }
      }
    }
  }

  // Scan skills (where Task calls with subagent_type live)
  scanDir(path.join(DIST_PLUGIN, 'skills'));

  if (errors.length > 0) {
    assert.fail(`Untransformed subagent_type references:\n${errors.join('\n')}`);
  }
});
```

### Anti-Patterns to Avoid

- **Testing source when you ship artifacts:** v1.0.3-1.0.8 failed because tests validated source files while bugs existed in built artifacts.
- **Single validation pass:** Run validation twice: once on source (catch errors early), once on artifacts (catch transform errors).
- **Grepping without structure:** Don't just `grep -r` for patterns; use file-aware parsing to provide meaningful error messages.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
| ------- | ----------- | ----------- | --- |
| YAML frontmatter parsing | Custom regex | Split on `---` markers | Simple split is sufficient for validation |
| File tree scanning | Recursive homebrew | `fs.readdirSync` with `withFileTypes` | Already proven in existing tests |
| Path resolution | String concatenation | `path.join()` + `path.relative()` | Cross-platform, handles edge cases |

**Key insight:** The existing test suite (`build.test.js`) already has solid patterns for scanning and validating. Artifact tests should extend these patterns, not reinvent them.

## Common Pitfalls

### Pitfall 1: Testing Source Instead of Artifacts

**What goes wrong:** Tests pass because source files are correct, but build transformation introduces bugs that only users see.

**Why it happens:** It's easier to test source (always present) than artifacts (must build first).

**How to avoid:**
1. Always run `npm run build:plugin` in `before()` hook for artifact tests
2. Point tests explicitly at `dist/plugin/`, not root directories
3. Name test files clearly (`artifact/*.test.js` vs `build.test.js`)

**Warning signs:**
- Tests reference `skills/` instead of `dist/plugin/skills/`
- No `before()` hook calling build script
- Tests pass locally but plugin fails for users

### Pitfall 2: Incomplete Path Transform Coverage

**What goes wrong:** Build script transforms some patterns but misses others, leading to partial failures.

**Why it happens:** The `@~/.claude/kata/` -> `@./kata/` transform was removed in Phase 2.1 (skills are now self-contained), but new transform patterns could emerge.

**How to avoid:**
1. Test for ABSENCE of old patterns (`@~/.claude/`)
2. Test for PRESENCE of required patterns (`@./references/`)
3. Enumerate ALL path patterns in dedicated test

**Warning signs:**
- Grep shows mixed path styles in artifacts
- Some skills work, others fail with "file not found"

### Pitfall 3: CI Order Dependencies

**What goes wrong:** Tests run before build, or artifact tests run but with stale artifacts.

**Why it happens:** CI steps may be parallelized incorrectly or cached artifacts used.

**How to avoid:**
1. Explicit dependency: artifact tests REQUIRE fresh build
2. Use `before()` to ensure build runs
3. Consider adding build hash/timestamp validation

**Warning signs:**
- CI passes but release fails
- "Works on my machine" scenarios
- Flaky tests that pass/fail randomly

### Pitfall 4: Missing Release Gate

**What goes wrong:** Artifact validation exists but doesn't block releases.

**Why it happens:** Tests added but CI workflow not updated to require them.

**How to avoid:**
1. Add artifact tests to `npm test` script
2. Ensure `plugin-release.yml` runs tests BEFORE creating release
3. Add explicit "Validate plugin build" step

**Warning signs:**
- Release created despite test failures
- Tests run in parallel with (not before) release step

## Code Examples

### Complete Artifact Validation Test Suite

```javascript
// tests/artifact/validate-plugin.test.js
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_PLUGIN = path.join(ROOT, 'dist/plugin');

describe('Plugin artifact validation', () => {
  before(() => {
    // Build fresh artifacts
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  describe('Structure validation', () => {
    test('required directories exist', () => {
      const required = ['skills', 'agents', 'commands', 'hooks', '.claude-plugin'];
      const missing = required.filter(d => !fs.existsSync(path.join(DIST_PLUGIN, d)));
      assert.strictEqual(missing.length, 0, `Missing directories: ${missing.join(', ')}`);
    });

    test('VERSION file matches package.json', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const version = fs.readFileSync(path.join(DIST_PLUGIN, 'VERSION'), 'utf8').trim();
      assert.strictEqual(version, pkg.version);
    });

    test('plugin.json is valid', () => {
      const pluginJson = JSON.parse(
        fs.readFileSync(path.join(DIST_PLUGIN, '.claude-plugin/plugin.json'), 'utf8')
      );
      assert.ok(pluginJson.name, 'plugin.json must have name');
      assert.ok(pluginJson.version, 'plugin.json must have version');
    });
  });

  describe('Path transformation validation', () => {
    test('no ~/.claude/ references in artifacts (excluding CHANGELOG)', () => {
      const errors = [];

      function scan(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.name.endsWith('.md') && entry.name !== 'CHANGELOG.md') {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('@~/.claude/')) {
              errors.push(path.relative(DIST_PLUGIN, fullPath));
            }
          }
        }
      }

      scan(DIST_PLUGIN);
      assert.strictEqual(errors.length, 0, `Old path references in:\n${errors.join('\n')}`);
    });

    test('skill @./references/ paths resolve', () => {
      const skillsDir = path.join(DIST_PLUGIN, 'skills');
      const errors = [];

      for (const skill of fs.readdirSync(skillsDir)) {
        const skillDir = path.join(skillsDir, skill);
        if (!fs.statSync(skillDir).isDirectory()) continue;

        const skillMd = path.join(skillDir, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;

        const content = fs.readFileSync(skillMd, 'utf8');
        const refs = content.match(/@\.\/references\/[^\s\n<>`"'()]+/g) || [];

        for (const ref of refs) {
          const relativePath = ref.substring(2);
          const fullPath = path.join(skillDir, relativePath);
          if (!fs.existsSync(fullPath)) {
            errors.push(`${skill}/SKILL.md: ${ref}`);
          }
        }
      }

      assert.strictEqual(errors.length, 0, `Broken references:\n${errors.join('\n')}`);
    });
  });

  describe('Agent namespacing validation', () => {
    test('subagent_type attributes use kata: prefix', () => {
      const skillsDir = path.join(DIST_PLUGIN, 'skills');
      const errors = [];

      function checkFile(filePath) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Match subagent_type="kata-xxx" that should be subagent_type="kata:kata-xxx"
        // Regex: subagent_type="kata- not followed by kata: (which would be correct)
        const pattern = /subagent_type="(kata-[^"]+)"/g;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const value = match[1];
          // Correct form: kata:kata-xxx
          // Incorrect form: kata-xxx (without kata: prefix)
          if (!value.startsWith('kata:')) {
            errors.push(`${path.relative(DIST_PLUGIN, filePath)}: subagent_type="${value}" should be "kata:${value}"`);
          }
        }
      }

      function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (entry.name.endsWith('.md')) {
            checkFile(fullPath);
          }
        }
      }

      scanDir(skillsDir);
      assert.strictEqual(errors.length, 0, `Untransformed subagent_type:\n${errors.join('\n')}`);
    });
  });

  describe('Skill frontmatter validation', () => {
    test('all skills have required frontmatter', () => {
      const skillsDir = path.join(DIST_PLUGIN, 'skills');
      const errors = [];

      for (const skill of fs.readdirSync(skillsDir)) {
        const skillMd = path.join(skillsDir, skill, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;

        const content = fs.readFileSync(skillMd, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);

        if (!fmMatch) {
          errors.push(`${skill}: missing frontmatter`);
          continue;
        }

        const fm = fmMatch[1];
        if (!fm.includes('name:')) {
          errors.push(`${skill}: missing 'name' in frontmatter`);
        }
        if (!fm.includes('description:')) {
          errors.push(`${skill}: missing 'description' in frontmatter`);
        }
      }

      assert.strictEqual(errors.length, 0, `Frontmatter errors:\n${errors.join('\n')}`);
    });
  });
});
```

### CI Workflow Integration

```yaml
# In plugin-release.yml, ensure tests run BEFORE release creation

- name: Run tests
  if: steps.check.outputs.should_publish == 'true'
  run: npm test

- name: Build plugin distribution
  if: steps.check.outputs.should_publish == 'true'
  run: |
    npm run build:hooks
    node scripts/build.js plugin

- name: Run artifact validation  # NEW STEP
  if: steps.check.outputs.should_publish == 'true'
  run: npm run test:artifacts

- name: Validate plugin build  # Existing but strengthened
  if: steps.check.outputs.should_publish == 'true'
  run: |
    # Verify critical files exist
    test -f dist/plugin/.claude-plugin/plugin.json
    test -d dist/plugin/skills
    test -d dist/plugin/commands
    test -d dist/plugin/hooks
    test -d dist/plugin/agents
    test -f dist/plugin/VERSION
    # NEW: Verify no old path patterns
    ! grep -r "@~/.claude/" dist/plugin/ --include="*.md" | grep -v CHANGELOG.md || exit 1
    echo "Plugin build validated"

- name: Create GitHub Release  # MOVED AFTER validation
  if: steps.check.outputs.should_publish == 'true'
  # ... release creation
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| ------------ | ---------------- | ------------ | ------ |
| `@~/.claude/kata/` paths | `@./references/` (skill-local) | Phase 2.1 | Skills are self-contained, no shared kata/ directory |
| `kata-` prefix on skill dirs | No prefix | Phase 7-01 | Clean `/kata:skill-name` invocation |
| Source-only testing | Source + artifact testing | This phase | Catches transform errors before release |

**Deprecated/outdated:**
- NPX distribution: Deprecated in v1.1.0, plugin is only distribution method
- `@~/.claude/kata/` references: Removed in Phase 2.1, skills use local `@./references/`
- `kata-` prefix on skill directories: Removed in Phase 7-01

## Open Questions

1. **Test performance with full build**
   - What we know: Running `npm run build:plugin` before artifact tests adds ~2-3s
   - What's unclear: Whether this impacts developer experience on frequent test runs
   - Recommendation: Accept the overhead; correctness > speed for release validation. Consider `npm run test:quick` (source only) vs `npm run test` (full with artifacts)

2. **Test coverage for all skills**
   - What we know: 27+ skills exist, each needs validation
   - What's unclear: Whether all skills have unique validation requirements
   - Recommendation: Use generic validation that works for all skills; add skill-specific tests only when bugs surface

## Sources

### Primary (HIGH confidence)
- `/Users/gannonhall/dev/oss/kata/scripts/build.js` - Build system source code
- `/Users/gannonhall/dev/oss/kata/tests/build.test.js` - Existing test patterns
- `/Users/gannonhall/dev/oss/kata/.github/workflows/plugin-release.yml` - CI workflow
- `/Users/gannonhall/dev/oss/kata/KATA-STYLE.md` - Project conventions

### Secondary (MEDIUM confidence)
- Project history: v1.0.3-1.0.8 patch releases addressed path resolution issues
- CLAUDE.md: Documents Phase 2.1 restructure and skill naming conventions

### Tertiary (LOW confidence)
- None identified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses only built-in Node.js, same as existing tests
- Architecture: HIGH - Extends proven patterns from existing test suite
- Pitfalls: HIGH - Based on actual project history (v1.0.3-1.0.8 issues)

**Research date:** 2026-01-28
**Valid until:** 60 days (stable domain, low churn expected)
