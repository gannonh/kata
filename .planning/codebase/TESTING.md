# Testing Patterns

**Analysis Date:** 2026-02-18

## Test Framework

**Runner:**
- Node.js built-in `node:test` module (no external test framework)
- Version: Node.js >= 20.0.0
- No external config file; everything in `package.json` scripts

**Assertion Library:**
- Node.js built-in `assert` and `assert/strict` modules

**Run Commands:**
```bash
npm test                    # Full suite (build + migration + artifacts + scripts)
npm run test:smoke         # Smoke tests (post-build validation)
npm run test:scripts       # Bash script tests only
npm run test:artifacts     # Build artifact validation
npm run test:skills        # Skill invocation tests with Claude CLI
npm run test:all           # All tests combined
npm run test:affected      # Only tests affected by git changes
```

## Test File Organization

**Location:**
- `tests/` directory at repository root
- Subdirectories:
  - `tests/harness/` — Shared utilities (assertions, runners)
  - `tests/scripts/` — Bash script tests
  - `tests/skills/` — Skill invocation tests
  - `tests/fixtures/` — Test data and sample codebases

**Naming Convention:**
- Format: `{module}.test.js` or `{feature}.test.js`
- Examples: `build.test.js`, `project-root.test.js`, `starting-projects.test.js`

**Structure:**
```
tests/
├── harness/
│   ├── assertions.js       # Shared assertion helpers
│   ├── runner.js           # Test configuration
│   ├── claude-cli.js       # Claude CLI invocation wrapper
│   └── affected.js         # Detect affected tests by git changes
├── scripts/
│   ├── project-root.test.js
│   ├── find-phase.test.js
│   └── ...
├── skills/
│   ├── starting-projects.test.js
│   ├── planning-phases.test.js
│   └── ...
├── fixtures/
│   └── scan-codebase/      # Sample codebases
├── build.test.js
├── smoke.test.js
├── artifact-validation.test.js
└── migration-validation.test.js
```

## Test Structure

**Suite Organization:**
```javascript
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

describe('Feature Name', () => {
  before(() => {
    // Setup: once before all tests
    execSync('npm run build:plugin', { cwd: ROOT, stdio: 'pipe' });
  });

  after(() => {
    // Cleanup: once after all tests
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('specific behavior description', () => {
    // Arrange, Act, Assert pattern
    const testData = { ... };
    const result = myFunction(testData);
    assert.strictEqual(result, expectedValue);
  });
});
```

**Patterns:**
- **Before/After hooks:** Shared setup/teardown for suite
  - Before: Build, create temp dirs, initialize repos
  - After: Clean up temp resources
- **Describe blocks:** Group tests by feature or component
- **Test naming:** Start with lowercase verb (creates, validates, resolves)
- **Isolation:** Each test gets fresh temp directory via `mkdtempSync()`

## Mocking

**Framework:** No mocking library (Node.js built-ins only)

**Patterns:**
- **Mock filesystems:** Use `mkdtempSync()` to create isolated temp directories
- **Mock shell execution:** `execSync()` with stdio redirection
- **Mock Claude responses:** Parse actual JSON from Claude CLI invocation

Example from `starting-projects.test.js`:
```javascript
beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'kata-test-starting-'));

  // Initialize git repo
  execSync('git init', { cwd: testDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });

  // Copy skill to test directory
  const skillSource = join(KATA_ROOT, 'skills', 'kata-new-project');
  const skillDest = join(testDir, '.claude', 'skills', 'kata-new-project');
  cpSync(skillSource, skillDest, { recursive: true });
});
```

**What to Mock:**
- File system operations (temp dirs, not real files)
- Environment variables (pass via options)
- External commands (execSync captures output)

**What NOT to Mock:**
- Actual skill execution (use real Claude CLI)
- File I/O in utilities (read from dist/)
- Git operations (use real git in temp repos)

## Fixtures and Factories

**Test Data:**
- Simple values: Inline in test code
- Complex objects: Defined as constants at top of test file
- Codebase samples: Stored in `tests/fixtures/` (e.g., `scan-codebase/sample.js`)

**Location:**
- Fixtures: `tests/fixtures/` directory
- Test utilities: `tests/harness/` directory
- Constants: Top of test file

## Coverage

**Requirements:** None enforced

**Metrics:**
- No coverage.json or coverage targets
- Quality driven by critical path testing (build, artifacts, skill invocation)

## Test Types

**Unit Tests (Script validation):**
- Scope: Individual bash or Node.js scripts
- Approach: Create temp dirs, run script, verify output and exit codes
- Example: `tests/scripts/find-phase.test.js` → `find-phase.sh`
- Files: `tests/scripts/*.test.js`

**Integration Tests (Skill invocation):**
- Scope: Full skill execution via Claude CLI
- Approach: Create temp project, invoke skill, parse JSON response
- Budget tiers: quick ($0.50), standard ($2.00), expensive ($5.00)
- Timeout tiers: quick (1min), standard (3min), expensive (5min)
- Example: `tests/skills/starting-projects.test.js` → `kata-new-project` skill
- Files: `tests/skills/*.test.js`

**Artifact Validation Tests:**
- Scope: Built plugin structure and contents
- Approach: Build, then validate files, paths, frontmatter
- Validates:
  - Directory structure (skills/, .claude-plugin/)
  - VERSION file matches package.json
  - No stale @~/.claude/ paths
  - SKILL.md frontmatter complete
  - @./references/ paths resolve
- File: `tests/artifact-validation.test.js`

**Build Tests:**
- Scope: Plugin build system (`scripts/build.js`)
- Approach: Run build, verify output structure
- Validates:
  - dist/plugin/ created
  - Skills directory included
  - Shared scripts distributed (kata-lib.cjs, manage-worktree.sh)
  - Script path transformations (${CLAUDE_PLUGIN_ROOT})
  - No cross-skill refs or stale patterns
- File: `tests/build.test.js`

**Smoke Tests:**
- Scope: Post-release verification
- Approach: Minimal checks for functionality
- Validates:
  - Plugin builds successfully
  - plugin.json exists and complete
  - VERSION file present
  - Skills use local @./ references
- File: `tests/smoke.test.js`

## Common Patterns

**Async Testing:**
- No async/await in tests (synchronous I/O, execSync)
- Claude CLI invocation wrapped in `invokeClaude()` helper (blocking)

**Error Testing:**
- Check exit codes: `assert.strictEqual(result.exitCode, 1)`
- Check error output: `assertResultContains(result, 'ERROR: ...')`
- Example from `artifact-validation.test.js`:
```javascript
test('no @~/.claude/ references in plugin', () => {
  const mdFiles = findFiles(PLUGIN_DIR, /\.md$/);
  const errors = [];

  for (const file of mdFiles) {
    if (path.basename(file) === 'CHANGELOG.md') continue;
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('@~/.claude/')) {
      errors.push(`contains @~/.claude/ reference`);
    }
  }

  assert.strictEqual(errors.length, 0, `Stale references:\n${errors.join('\n')}`);
});
```

## Assertion Helpers

**From `tests/harness/assertions.js`:**
```javascript
// Assert skill was invoked (not just ad-hoc response)
assertSkillInvoked(result, message)

// Assert response completed without error
assertNoError(result, message)

// Assert artifact exists at path
assertArtifactExists(basePath, relativePath, message)

// Assert directory contains file matching pattern
assertFileMatchesPattern(dirPath, pattern, message)

// Assert response text contains expected content
assertResultContains(result, expected, message)

// Assert "Next Up" section proposes expected command
assertNextStepProposed(result, expectedCommand, message)

// Assert all expected paths exist
assertFileStructure(basePath, expectedPaths, message)
```

## Special Patterns

**Affected Tests Detection (from `tests/harness/affected.js`):**
- Reads git diff to determine changed files
- Maps to affected test files
- Enables fast CI cycles with subset execution

**Test Configuration (from `tests/harness/runner.js`):**
```javascript
export const config = {
  budgets: {
    quick: 0.50,      // Simple skill trigger tests
    standard: 2.00,   // Full skill workflow tests
    expensive: 5.00   // Complex multi-turn tests
  },
  timeouts: {
    quick: 60000,     // 1 min
    standard: 180000, // 3 min
    expensive: 300000 // 5 min
  },
  isolation: {
    tempPrefix: 'kata-test-',
    cleanupOnFailure: true
  }
};
```

**Claude CLI Invocation (from `tests/harness/claude-cli.js`):**
```javascript
export function invokeClaude(prompt, options = {}) {
  const {
    cwd,                                    // Required: working directory
    allowedTools = 'Read,Bash,Glob,Write', // Default tool set
    maxBudget = 1.00,                       // Default cost limit
    timeout = 120000                        // Default timeout (ms)
  } = options;

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

---

*Testing analysis: 2026-02-18 | Source: tests/, package.json, test harness*

<objective>
[What feature and why]
</objective>

<feature>
  <name>[Feature name]</name>
  <files>[source file, test file]</files>
  <behavior>
    [Expected behavior in testable terms]
    Cases: input -> expected output
  </behavior>
  <implementation>[How to implement once tests pass]</implementation>
</feature>
```

### TDD Execution Cycle

**RED - Write failing test:**
1. Create test file following project conventions
2. Write test describing expected behavior
3. Run test - it MUST fail
4. Commit: `test({phase}-{plan}): add failing test for [feature]`

**GREEN - Implement to pass:**
1. Write minimal code to make test pass
2. Run tests - MUST pass
3. Commit: `feat({phase}-{plan}): implement [feature]`

**REFACTOR (if needed):**
1. Clean up implementation if obvious improvements
2. Run tests - MUST still pass
3. Commit only if changes: `refactor({phase}-{plan}): clean up [feature]`

**Result:** Each TDD plan produces 2-3 atomic commits.

## Verification Patterns

### Task-Level Verification

Every `type="auto"` task must have:

```xml
<verify>[Command or check to prove completion]</verify>
```

**Good verification:**
- `npm test` passes
- `curl -X POST /api/auth/login` returns 200 with Set-Cookie header
- `ls src/components/Chat.tsx` exists and is > 30 lines
- `grep -q "model Message" prisma/schema.prisma`

**Bad verification:**
- "It works"
- "Looks good"
- "Code compiles"

### Phase-Level Verification

After all tasks complete, `<verification>` section runs overall checks:

```xml
<verification>
- Application starts without errors: npm run dev
- All API endpoints respond: curl health check
- Database migrations applied: prisma db status
</verification>
```

### Checkpoint Verification

`checkpoint:human-verify` tasks include verification steps for humans:

```xml
<task type="checkpoint:human-verify">
  <what-built>Complete auth flow (schema + API + UI)</what-built>
  <how-to-verify>
    1. Visit http://localhost:3000/login
    2. Enter test@example.com / password123
    3. Should redirect to /dashboard
    4. Refresh page - should stay logged in
  </how-to-verify>
</task>
```

## Goal-Backward Verification

GSD uses goal-backward methodology to derive must-haves:

### Must-Haves Structure

```yaml
must_haves:
  truths:
    - "User can see existing messages"
    - "User can send a message"
    - "Messages persist across refresh"
  artifacts:
    - path: "src/components/Chat.tsx"
      provides: "Message list rendering"
      min_lines: 30
    - path: "src/app/api/chat/route.ts"
      provides: "Message CRUD operations"
      exports: ["GET", "POST"]
  key_links:
    - from: "src/components/Chat.tsx"
      to: "/api/chat"
      via: "fetch in useEffect"
      pattern: "fetch.*api/chat"
```

### Verification Agent

The `kata-verifier` agent checks must-haves against actual codebase:

1. **Truths** — Observable behaviors (verified by running app)
2. **Artifacts** — Files exist with expected content
3. **Key links** — Critical connections between components

Creates `VERIFICATION.md` with detailed report:
- `passed` — All must-haves verified
- `gaps_found` — Some must-haves missing
- `human_needed` — Manual verification required

## Test Types for Target Projects

When GSD plans testing phases for target projects:

### Unit Tests

- Test single function/class in isolation
- Mock all external dependencies
- Fast: <1s per test

**TDD candidates:**
- Business logic with defined inputs/outputs
- Data transformations, parsing, formatting
- Validation rules and constraints
- Algorithms with testable behavior

### Integration Tests

- Test multiple modules together
- Mock only external boundaries (APIs, databases)
- May use test database

**When to use:**
- API endpoint tests
- Service layer tests
- Database operations

### E2E Tests

- Test full user flows
- No mocking (real browser, real backend)
- Slow but comprehensive

**When to use:**
- Critical user journeys
- Smoke tests for deployments
- Regression testing

## Mocking Guidance (for Target Projects)

### What to Mock

- External APIs and services
- File system operations
- Database connections (in unit tests)
- Time/dates (use fake timers)
- Network calls

### What NOT to Mock

- Pure functions and utilities
- Internal business logic
- Type definitions
- Simple transformations

### Mocking Pattern (Vitest example)

```typescript
import { vi } from 'vitest';
import { externalFunction } from './external';

vi.mock('./external', () => ({
  externalFunction: vi.fn()
}));

describe('test suite', () => {
  it('mocks function', () => {
    const mockFn = vi.mocked(externalFunction);
    mockFn.mockReturnValue('mocked result');

    // test code using mocked function

    expect(mockFn).toHaveBeenCalledWith('expected arg');
  });
});
```

## Error Testing Patterns

### Sync Error Testing

```typescript
it('should throw on invalid input', () => {
  expect(() => parse(null)).toThrow('Cannot parse null');
});
```

### Async Error Testing

```typescript
it('should reject on file not found', async () => {
  await expect(readConfig('invalid.txt')).rejects.toThrow('ENOENT');
});
```

## Coverage

**GSD itself:** No coverage tracking (no test suite)

**Target projects:** Coverage is optional unless project specifies requirements.

When planning test phases, include coverage only if:
- Project has existing coverage requirements
- CI/CD pipeline enforces coverage thresholds
- Explicitly requested by user

## Running Tests (for Target Projects)

GSD detects project test framework from package.json:

| Framework | Run Command | Watch | Coverage |
|-----------|-------------|-------|----------|
| Jest | `npm test` | `npm test -- --watch` | `npm test -- --coverage` |
| Vitest | `npm test` | `npm test -- --watch` | `npm run test:coverage` |
| pytest | `pytest` | `pytest --watch` | `pytest --cov` |
| Go | `go test ./...` | N/A | `go test -cover ./...` |

## Summary

GSD is not a tested codebase — it's a prompting system that helps build tested codebases.

Testing patterns GSD supports:
1. **Inline verification** in PLAN.md tasks
2. **TDD plans** with RED-GREEN-REFACTOR cycle
3. **Goal-backward verification** via must-haves
4. **Checkpoint verification** for human review

When planning test phases for target projects, follow these patterns and adapt to the target project's existing test infrastructure.

---

*Testing analysis: 2026-01-16*
