# Phase 0: Develop Robust Testing Suite - Research

**Researched:** 2026-01-25
**Domain:** CLI-based testing for AI agent workflows
**Confidence:** HIGH

## Summary

This phase establishes comprehensive testing infrastructure for Kata skills using Claude Code's CLI (`claude -p`) in headless mode. The existing test harness in `tests/harness/` provides a solid foundation with `invokeClaude()` wrapper and assertion helpers. The research confirms that Kata's template-driven, deterministic output design makes CLI-based testing viable: skills produce predictable artifacts, file structures, and next-step directions that can be validated programmatically.

The key insight from CONTEXT.md is that we're testing **structured outputs, not free-form prose**. Kata's design constrains Claude to produce predictable results, making assertions practical. The primary challenges are: cost control (API calls per test), affected-test detection for CI efficiency, and GitHub PR annotation integration.

**Primary recommendation:** Extend the existing test harness with per-skill test files, implement git-diff-based affected test detection, and use `mikepenz/action-junit-report` for PR annotations.

## Standard Stack

The established tools for this domain:

### Core

| Tool                    | Version | Purpose                               | Why Standard                                                |
| ----------------------- | ------- | ------------------------------------- | ----------------------------------------------------------- |
| `node:test`             | Node 20 | Built-in test runner                  | Zero dependencies, JUnit XML output, native Node.js support |
| `claude -p`             | Latest  | Headless Claude invocation            | Official CLI, JSON output, budget control                   |
| `jq`                    | Latest  | JSON parsing in CI                    | Standard Unix tool for extracting test results              |
| GitHub Actions          | Latest  | CI/CD platform                        | Native to Kata's existing workflow                          |

### Supporting

| Tool                           | Version  | Purpose                     | When to Use                        |
| ------------------------------ | -------- | --------------------------- | ---------------------------------- |
| `mikepenz/action-junit-report` | v4       | JUnit XML to PR annotations | Report test failures inline on PRs |
| `jest-changed-files`           | 30.2.0   | Git diff analysis           | Detect changed files for filtering |
| `git diff --name-only`         | Built-in | File change detection       | Determine which skills changed     |

### Alternatives Considered

| Instead of                     | Could Use                       | Tradeoff                                             |
| ------------------------------ | ------------------------------- | ---------------------------------------------------- |
| `node:test`                    | Jest                            | Jest has affected-test built-in, but adds dependency |
| `mikepenz/action-junit-report` | reviewdog                       | reviewdog needs checkstyle format, not JUnit XML     |
| Custom diff detection          | Turborepo / nx                  | Overkill for non-monorepo structure                  |

**Installation:**
```bash
# No new npm dependencies needed - using built-in node:test
# GitHub Actions tools installed via action marketplace
```

## Architecture Patterns

### Recommended Test Structure

```
tests/
├── README.md                    # Existing - update with new patterns
├── harness/
│   ├── claude-cli.js            # Existing - invokeClaude() wrapper
│   ├── assertions.js            # Existing - extend with skill-specific
│   ├── runner.js                # Existing - cost/timeout configs
│   └── affected.js              # NEW: git-diff-based test filtering
├── fixtures/
│   └── kata-project/            # Existing - minimal project fixture
├── build.test.js                # Existing - build validation
├── smoke.test.js                # Existing - installation validation
└── skills/                      # NEW: per-skill test files
    ├── tracking-progress.test.js
    ├── adding-phases.test.js
    ├── planning-phases.test.js
    ├── executing-phases.test.js
    └── ...                      # One file per skill
```

### Pattern 1: Skill Test Structure

**What:** Each skill gets a dedicated test file with setup, invocation, and assertions.

**When to use:** Every skill needs at least one test validating its primary workflow.

**Example:**
```javascript
// Source: Existing tests/harness pattern + official Claude docs
import { describe, it, beforeEach, afterEach } from 'node:test';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { invokeClaude } from '../harness/claude-cli.js';
import { assertSkillInvoked, assertNoError, assertArtifactExists } from '../harness/assertions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'kata-project');
const KATA_ROOT = join(__dirname, '..', '..');

describe('kata-adding-phases', () => {
  let testDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'kata-test-'));
    cpSync(FIXTURES_DIR, testDir, { recursive: true });

    // Install skill being tested
    const skillSource = join(KATA_ROOT, 'skills', 'kata-adding-phases');
    const skillDest = join(testDir, '.claude', 'skills', 'kata-adding-phases');
    cpSync(skillSource, skillDest, { recursive: true });
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('creates phase directory and updates roadmap', async () => {
    const result = invokeClaude('add a new phase for authentication', {
      cwd: testDir,
      maxBudget: 2.00,
      timeout: 180000
    });

    assertNoError(result);
    assertSkillInvoked(result);

    // Verify artifacts created
    assertArtifactExists(testDir, '.planning/phases');

    // Verify roadmap updated
    const roadmap = readFileSync(join(testDir, '.planning/ROADMAP.md'), 'utf8');
    assert.ok(roadmap.includes('authentication'), 'Roadmap should mention authentication');
  });
});
```

### Pattern 2: Affected Test Detection

**What:** Only run tests for skills that changed in the PR, reducing API costs.

**When to use:** CI pipeline on every PR.

**Example:**
```javascript
// tests/harness/affected.js
// Source: jest-changed-files pattern + git diff
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Get list of skills affected by current changes.
 * Uses git diff against main branch.
 */
export function getAffectedSkills(baseBranch = 'origin/main') {
  const changedFiles = execSync(
    `git diff --name-only ${baseBranch}...HEAD`,
    { encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean);

  const affectedSkills = new Set();

  for (const file of changedFiles) {
    // Direct skill changes
    const skillMatch = file.match(/^skills\/(kata-[^/]+)\//);
    if (skillMatch) {
      affectedSkills.add(skillMatch[1]);
    }

    // Agent changes affect skills that use them
    const agentMatch = file.match(/^agents\/(kata-[^.]+)\.md$/);
    if (agentMatch) {
      // Map agents to skills that spawn them
      const skillsUsingAgent = getSkillsUsingAgent(agentMatch[1]);
      skillsUsingAgent.forEach(s => affectedSkills.add(s));
    }
  }

  return Array.from(affectedSkills);
}

/**
 * Get test files for affected skills only.
 */
export function getAffectedTestFiles(baseBranch = 'origin/main') {
  const affected = getAffectedSkills(baseBranch);
  const testFiles = [];

  for (const skill of affected) {
    const testFile = `tests/skills/${skill.replace('kata-', '')}.test.js`;
    // Check if test file exists before adding
    testFiles.push(testFile);
  }

  return testFiles;
}
```

### Pattern 3: CI Workflow with Affected Tests

**What:** GitHub Actions workflow that runs only affected skill tests.

**When to use:** On every PR to control costs.

**Example:**
```yaml
# .github/workflows/test-skills.yml
name: Skill Tests

on:
  pull_request:
    branches: [main]

jobs:
  test-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for git diff

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Detect affected skills
        id: affected
        run: |
          AFFECTED=$(node -e "
            const { getAffectedTestFiles } = await import('./tests/harness/affected.js');
            console.log(getAffectedTestFiles().join(' '));
          ")
          echo "test_files=$AFFECTED" >> $GITHUB_OUTPUT
          echo "has_tests=$( [ -n \"$AFFECTED\" ] && echo true || echo false )" >> $GITHUB_OUTPUT

      - name: Run affected skill tests
        if: steps.affected.outputs.has_tests == 'true'
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          node --test --test-reporter junit --test-reporter-destination junit.xml \
            ${{ steps.affected.outputs.test_files }}

      - name: Publish test results
        if: always()
        uses: mikepenz/action-junit-report@v4
        with:
          report_paths: 'junit.xml'
          fail_on_failure: true
          include_passed: false
```

### Anti-Patterns to Avoid

- **Testing prose output:** Don't assert on Claude's conversational text. Test file artifacts, directory structures, and presence of key patterns.
- **Running all tests on every PR:** API costs will explode. Always use affected-test detection.
- **Hardcoding expected output:** Claude's exact wording varies. Test for structural elements, not exact strings.
- **No timeout/budget limits:** Always set `maxBudget` and `timeout` to prevent runaway costs.
- **Testing in production directories:** Always use isolated temp directories per test.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem                     | Don't Build           | Use Instead               | Why                                             |
| --------------------------- | --------------------- | ------------------------- | ----------------------------------------------- |
| JUnit XML generation        | Custom reporter       | `--test-reporter junit`   | Node.js test runner has built-in JUnit output   |
| PR annotations              | GitHub API wrapper    | mikepenz/action-junit-report | Handles all annotation formats, truncation, etc |
| Git diff parsing            | Regex-based solution  | Simple `git diff --name-only` | Git's output is already clean and parseable   |
| JSON output parsing         | Manual string parsing | `jq` or JSON.parse        | Robust handling of edge cases                   |
| Test isolation              | Shared state          | mkdtempSync per test      | Existing pattern in harness works well          |

**Key insight:** The existing test harness in `tests/harness/` already handles the hard parts. Extend it, don't replace it.

## Common Pitfalls

### Pitfall 1: Cost Explosion in CI

**What goes wrong:** Running all skill tests on every PR causes $50+ API bills.

**Why it happens:** Each skill test invokes Claude which costs real money. 27 skills x $2/test = $54/run.

**How to avoid:**
- Implement affected-test detection
- Set `maxBudget` per test (default $2.00)
- Run full test suite only on main branch merges

**Warning signs:** CI bills spiking, tests timing out from rate limits.

### Pitfall 2: Flaky Tests from Non-Deterministic Output

**What goes wrong:** Tests pass sometimes, fail others, despite no code changes.

**Why it happens:** Claude's natural language varies even with same prompt.

**How to avoid:**
- Test structural output (files created, directories, patterns)
- Use regex/contains for key phrases, not exact string match
- Test presence of elements, not exact formatting

**Warning signs:** Tests that fail intermittently on retry.

### Pitfall 3: Incomplete Test Isolation

**What goes wrong:** Tests interfere with each other, causing cascading failures.

**Why it happens:** Shared temp directories, lingering files, race conditions.

**How to avoid:**
- Use `mkdtempSync` for each test (existing pattern)
- Clean up in `afterEach` hook
- Use `--no-session-persistence` flag

**Warning signs:** Tests pass individually but fail when run together.

### Pitfall 4: Missing API Key in CI

**What goes wrong:** Tests fail with authentication errors in CI but pass locally.

**Why it happens:** `ANTHROPIC_API_KEY` not configured as GitHub secret.

**How to avoid:**
- Set up `ANTHROPIC_API_KEY` as repository secret
- Document this in tests/README.md
- Fail fast with clear error message if key missing

**Warning signs:** All tests fail with "API key not found" errors.

### Pitfall 5: Timeout Issues with Complex Skills

**What goes wrong:** Skills like `kata-executing-phases` timeout before completing.

**Why it happens:** Complex skills spawn subagents, take 3+ minutes.

**How to avoid:**
- Use appropriate timeout tiers (quick: 60s, standard: 180s, expensive: 300s)
- Test simpler skills at lower cost first
- Consider splitting complex skill tests into smaller scenarios

**Warning signs:** Tests timing out consistently at 2 minute mark.

## Code Examples

Verified patterns from official sources and existing Kata code:

### Claude CLI Invocation with Budget Control

```javascript
// Source: https://code.claude.com/docs/en/cli-reference
// Combined with existing tests/harness/claude-cli.js pattern

export function invokeClaude(prompt, options = {}) {
  const {
    cwd,
    allowedTools = 'Read,Bash,Glob,Write',
    maxBudget = 1.00,
    timeout = 120000
  } = options;

  if (!cwd) {
    throw new Error('cwd is required for test isolation');
  }

  const args = [
    '-p', JSON.stringify(prompt),
    '--output-format', 'json',
    '--allowedTools', JSON.stringify(allowedTools),
    '--max-budget-usd', String(maxBudget),
    '--no-session-persistence'
  ];

  const result = execSync(`claude ${args.join(' ')}`, {
    encoding: 'utf8',
    cwd,
    timeout,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  return JSON.parse(result);
}
```

### Assertion for Next-Step Proposal

```javascript
// Source: CONTEXT.md requirement - validate next-step proposals
// Pattern derived from existing assertResultContains

/**
 * Assert Claude's response proposes the expected next command.
 * Tests for presence of slash command in "Next Up" section.
 */
export function assertNextStepProposed(result, expectedCommand) {
  const text = result.result || '';

  // Look for "Next Up" section with the command
  const nextUpPattern = /## ▶ Next Up[\s\S]*?(\/kata:[a-z-]+)/i;
  const match = text.match(nextUpPattern);

  assert.ok(
    match && match[1].includes(expectedCommand),
    `Expected next step "${expectedCommand}", got: ${match ? match[1] : 'no next step found'}`
  );
}

/**
 * Assert skill created expected file structure.
 */
export function assertFileStructure(basePath, expectedPaths) {
  const errors = [];

  for (const path of expectedPaths) {
    const fullPath = join(basePath, path);
    if (!existsSync(fullPath)) {
      errors.push(`Missing: ${path}`);
    }
  }

  if (errors.length > 0) {
    assert.fail(`File structure mismatch:\n${errors.join('\n')}`);
  }
}
```

### GitHub Actions JUnit Reporter Setup

```yaml
# Source: https://github.com/mikepenz/action-junit-report
# Combined with Node.js test runner JUnit output

- name: Run skill tests
  run: |
    node --test \
      --test-reporter spec \
      --test-reporter junit --test-reporter-destination junit.xml \
      tests/skills/*.test.js

- name: Publish test results
  if: always()
  uses: mikepenz/action-junit-report@v4
  with:
    report_paths: 'junit.xml'
    fail_on_failure: true
    include_passed: false
    check_name: 'Skill Test Results'
    # Annotations on changed files only (reduces noise)
    annotate_only_on_changed_files: true
```

## State of the Art

| Old Approach              | Current Approach                | When Changed | Impact                                   |
| ------------------------- | ------------------------------- | ------------ | ---------------------------------------- |
| `claude --print`          | `claude -p` (Agent SDK)         | 2026         | Same behavior, cleaner documentation     |
| `--output-format json`    | Same, now part of Agent SDK     | 2026         | JSON output includes session metadata    |
| Jest with `--changedSince` | Native node:test + git diff    | Node 20      | Zero dependencies for changed-file tests |

**Deprecated/outdated:**
- **`headless mode` terminology:** Now called "Agent SDK" or "CLI mode", but `-p` flag unchanged
- **Separate test frameworks:** Node.js 20+ built-in test runner is sufficient

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal budget per skill category**
   - What we know: Simple skills (status check) need ~$0.50, complex (phase execution) need ~$5.00
   - What's unclear: Exact budget for each of the 27 skills
   - Recommendation: Start with $2.00 default, adjust based on test results

2. **Agent-to-skill dependency mapping**
   - What we know: Need to map which agents affect which skills
   - What's unclear: Complete mapping requires auditing all SKILL.md files
   - Recommendation: Build mapping as part of affected-test implementation

3. **Test fixture complexity**
   - What we know: Current fixture is minimal (no phases planned)
   - What's unclear: Some skills may need richer fixtures
   - Recommendation: Create skill-specific fixtures as needed in tests/fixtures/

## Sources

### Primary (HIGH confidence)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) - All CLI flags including `--max-budget-usd`, `--no-session-persistence`
- [Claude Code Headless Mode](https://code.claude.com/docs/en/headless) - Programmatic invocation patterns
- Existing `tests/harness/` code - `invokeClaude()` pattern, assertions, runner config
- Existing `tests/README.md` - Documented test architecture

### Secondary (MEDIUM confidence)
- [mikepenz/action-junit-report](https://github.com/mikepenz/action-junit-report) - JUnit XML to PR annotations
- [Node.js Test Runner](https://nodejs.org/api/test.html) - Built-in test runner documentation
- [jest-changed-files](https://www.npmjs.com/package/jest-changed-files) - Git diff analysis patterns

### Tertiary (LOW confidence)
- WebSearch results on affected-test detection - Various approaches, need validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Using existing harness, official Claude CLI docs
- Architecture: HIGH - Extending proven patterns from existing tests
- Pitfalls: HIGH - Based on real issues from similar testing domains

**Research date:** 2026-01-25
**Valid until:** 60 days (stable domain, CLI rarely changes)
