# Phase 2: Unit Test Coverage - Research

**Researched:** 2026-02-05
**Domain:** Bun test runner, coverage tooling, TypeScript unit testing patterns
**Confidence:** HIGH

## Summary

Research focused on implementing unit test coverage for a Bun monorepo using the native Bun test runner. The codebase already has established testing patterns (git-service.test.ts, pr-service.test.ts) and test infrastructure. Current coverage shows 45.66% function coverage and 50.90% line coverage across all files, with many modules untested.

The primary challenges are:
1. Configuring Bun's coverage tooling to generate actionable reports
2. Identifying coverage gaps (Bun only tracks imported modules, creating false positives)
3. Following established patterns for new unit tests
4. Documenting rationale for deferred coverage

**Primary recommendation:** Use Bun's native coverage tooling with lcov reporter for CI, implement a coverage utility to force-load all modules (revealing true gaps), follow existing git-service.test.ts patterns for new tests, and document coverage gaps with clear rationale.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.3.8 | Test runner and coverage | Native test runner, built-in coverage, fast execution |
| TypeScript | 5.0.0 | Type safety | Project language, type-safe test assertions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| simple-git | 3.30.0 | Git operations testing | Already used in git-service.ts tests |
| @types/node | 25.0.8 | Node.js type definitions | For fs, child_process, path mocking |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun test | Jest | Jest has more mature mocking ecosystem, but Bun is faster and native to this project |
| Bun coverage | c8/nyc | c8 has more features, but Bun coverage is zero-config and integrated |

**Installation:**
No new packages needed. Bun test runner is already installed.

## Architecture Patterns

### Recommended Project Structure
```
packages/shared/src/
├── git/
│   ├── git-service.ts
│   ├── pr-service.ts
│   └── __tests__/
│       ├── git-service.test.ts       # Existing pattern
│       └── pr-service.test.ts        # Existing pattern
├── agent/
│   └── __tests__/
│       └── tool-matching.test.ts     # Complex logic tests
└── [module]/
    └── __tests__/
        └── [module].test.ts
```

### Pattern 1: File System Isolation for Integration Tests
**What:** Create temporary directories per test, clean up in afterEach
**When to use:** Testing services that interact with file system (git, config, storage)
**Example:**
```typescript
// Source: packages/shared/src/git/__tests__/git-service.test.ts
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, rmSync } from 'fs'
import { execSync } from 'child_process'

function createTempDir(prefix: string): string {
  const dir = join(tmpdir(), `kata-git-test-${prefix}-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('git-service', () => {
  let tempDir: string

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir)
    }
  })

  it('should detect git repository', async () => {
    tempDir = createTempDir('git-repo')
    execSync('git init', { cwd: tempDir, stdio: 'pipe' })
    const result = await isGitRepository(tempDir)
    expect(result).toBe(true)
  })
})
```

### Pattern 2: Mock External Commands with mock.module()
**What:** Replace child_process executions with mocked responses
**When to use:** Testing services that shell out to external CLIs (gh, git)
**Example:**
```typescript
// Source: packages/shared/src/git/__tests__/pr-service.test.ts
import { mock } from 'bun:test'

// Mock storage for test results
let mockExecResult: { stdout?: string; error?: Error } = {}

// Mock BEFORE importing the module under test
mock.module('node:child_process', () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: object,
    callback: (error: Error | null, result: { stdout: string }) => void
  ) => {
    if (mockExecResult.error) {
      callback(mockExecResult.error, { stdout: '', stderr: '' })
    } else {
      callback(null, { stdout: mockExecResult.stdout || '', stderr: '' })
    }
  },
}))

// Import AFTER mocking
const { getPrStatus } = await import('../pr-service')

describe('pr-service', () => {
  beforeEach(() => {
    mockExecResult = {} // Reset between tests
  })

  it('should parse gh CLI output', async () => {
    mockExecResult = { stdout: JSON.stringify({ number: 42, title: 'Test' }) }
    const result = await getPrStatus('/repo')
    expect(result).toEqual({ number: 42, title: 'Test' })
  })
})
```

### Pattern 3: Deterministic Testing of Complex Logic
**What:** Exhaustive tests covering edge cases, order-independence, idempotency
**When to use:** Core business logic with complex state (tool-matching, event-processor)
**Example:**
```typescript
// Source: packages/shared/src/agent/__tests__/tool-matching.test.ts
describe('Determinism property', () => {
  it('same tool_starts in different order produce same events', () => {
    // Process blocks in order A, B, C
    const indexA = new ToolIndex()
    const blocksA = [toolA, toolB, toolC]
    const eventsA = extractToolStarts(blocksA, null, indexA, new Set())

    // Process blocks in order C, A, B
    const indexB = new ToolIndex()
    const blocksB = [toolC, toolA, toolB]
    const eventsB = extractToolStarts(blocksB, null, indexB, new Set())

    // Results should be identical (order-independent)
    expect(sortById(eventsA)).toEqual(sortById(eventsB))
  })
})
```

### Pattern 4: Coverage Utility to Force Module Loading
**What:** Helper that dynamically imports all source files to reveal true coverage
**When to use:** Identifying untested modules (Bun only tracks imported files)
**Example:**
```typescript
// Source: https://www.charpeni.com/blog/bun-code-coverage-gap
import { Glob } from 'bun'

export async function importAllModules(
  dir: string,
  exclude: string[] = []
): Promise<void> {
  const glob = new Glob('**/*.ts')
  const defaultExclusions = ['**/*.test.ts', '**/*.d.ts', ...exclude]

  const files = []
  for await (const file of glob.scan(dir)) {
    if (defaultExclusions.some(pattern => file.includes(pattern))) continue
    files.push(import(`${dir}/${file}`))
  }

  await Promise.all(files)
}
```

### Anti-Patterns to Avoid
- **Global state pollution:** Don't share state between tests. Use beforeEach/afterEach to reset.
- **Testing implementation details:** Test public APIs, not internal private methods.
- **Mocking too much:** Over-mocking makes tests brittle. Only mock external dependencies.
- **Ignoring async:** Always await async operations. Bun test won't wait for hanging promises.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Coverage reporting | Custom instrumentation | `bun test --coverage` | Native, zero-config, generates lcov |
| Module mocking | Manual require cache manipulation | `mock.module()` | Handles ESM/CJS, auto-cleanup between tests |
| Test isolation | Manual setup/teardown | `beforeEach`/`afterEach` hooks | Automatic, reliable, standard pattern |
| Coverage gaps detection | Manual file listing | importAllModules utility | Bun only tracks loaded files, need force-load |
| Temp file cleanup | Manual rmSync calls | Helper + afterEach hook | Prevents test pollution, handles errors |

**Key insight:** Bun's test runner is Jest-compatible but faster. Use native features (mock, spyOn, lifecycle hooks) instead of external libraries. The main gotcha is coverage only tracking imported modules, which creates false 100% reports.

## Common Pitfalls

### Pitfall 1: Coverage Reports Show 100% But Files Are Missing
**What goes wrong:** Bun coverage only tracks files loaded during test execution. Untested modules don't appear in reports, creating false sense of complete coverage.
**Why it happens:** This is documented Bun behavior, not a bug. Coverage denominator excludes unimported files.
**How to avoid:**
1. Create a test that imports all source modules using Bun.Glob
2. Compare coverage report file list against actual source files
3. Use `find packages/shared/src -name "*.ts" | wc -l` vs coverage report file count
**Warning signs:**
- 100% coverage but suspiciously few files in report
- New files added but coverage stays at 100%
- Coverage report doesn't list all known modules

### Pitfall 2: Mock.module() Called After Import
**What goes wrong:** Mocking has no effect because module already loaded
**Why it happens:** ES modules are cached on first import. Mocking after import is too late.
**How to avoid:** Always mock.module() BEFORE importing the module under test
**Warning signs:** Tests fail saying "X is not a function" or original implementation executes

### Pitfall 3: Shared State Between Tests
**What goes wrong:** Tests pass in isolation but fail when run together
**Why it happens:** Module-level variables, singleton instances, or file system state leaks between tests
**How to avoid:**
- Reset module state in beforeEach
- Clean up temp files in afterEach
- Use separate temp directories per test with unique timestamps
**Warning signs:** `bun test single.test.ts` passes, but `bun test` fails

### Pitfall 4: Forgetting to Await Async Functions
**What goes wrong:** Test completes before assertions run, always passes
**Why it happens:** Bun won't wait for unhandled promises
**How to avoid:** Always mark test as async and await all promises
**Warning signs:** Tests pass even with obviously wrong assertions

### Pitfall 5: Over-Mocking Makes Tests Brittle
**What goes wrong:** Tests break on refactoring even when behavior is correct
**Why it happens:** Mocking internal implementation details instead of external dependencies
**How to avoid:** Only mock external boundaries (network, file system, child processes). Test public APIs.
**Warning signs:** Renaming a private function breaks multiple tests

## Code Examples

Verified patterns from official sources:

### Running Coverage Report
```bash
# Console output
bun test --coverage

# Generate lcov for CI
bun test --coverage --coverage-reporter=lcov

# Multiple reporters
bun test --coverage --coverage-reporter=text --coverage-reporter=lcov
```
Source: https://bun.com/docs/test/code-coverage

### Configuring Coverage in bunfig.toml
```toml
[test]
coverage = true
coverageReporter = ["text", "lcov"]
coverageDir = "coverage"
coverageThreshold = { lines = 0.8, functions = 0.8, statements = 0.8 }
coverageSkipTestFiles = true
coveragePathIgnorePatterns = [
  "**/*.test.ts",
  "**/node_modules/**",
  "apps/electron/release/**"
]
```
Source: https://bun.com/docs/test/code-coverage

### Force-Loading All Modules for Accurate Coverage
```typescript
// packages/shared/tests/coverage-helper.test.ts
import { describe, it } from 'bun:test'
import { Glob } from 'bun'

describe('Coverage - force load all modules', () => {
  it('should import all source files', async () => {
    const glob = new Glob('**/*.ts')
    const exclusions = ['**/*.test.ts', '**/*.d.ts', '**/index.ts']

    const imports = []
    for await (const file of glob.scan('./packages/shared/src')) {
      if (exclusions.some(pattern => file.includes(pattern.replace('**/', '')))) continue
      imports.push(import(`../src/${file}`))
    }

    await Promise.all(imports)
  })
})
```
Source: https://www.charpeni.com/blog/bun-code-coverage-gap

### Lifecycle Hooks Pattern
```typescript
// Source: packages/shared/src/git/__tests__/git-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

describe('service tests', () => {
  let resource: Resource

  beforeEach(() => {
    resource = setupResource()
  })

  afterEach(() => {
    cleanupResource(resource)
  })

  it('should use resource', () => {
    expect(resource).toBeDefined()
  })
})
```

### Mocking Child Process
```typescript
// Source: packages/shared/src/git/__tests__/pr-service.test.ts
import { mock, beforeEach } from 'bun:test'

let mockExecResult: { stdout?: string; error?: Error } = {}

mock.module('node:child_process', () => ({
  execFile: (cmd, args, opts, callback) => {
    if (mockExecResult.error) {
      callback(mockExecResult.error, { stdout: '', stderr: '' })
    } else {
      callback(null, { stdout: mockExecResult.stdout || '', stderr: '' })
    }
  },
}))

const { serviceUnderTest } = await import('../service')

describe('service', () => {
  beforeEach(() => {
    mockExecResult = {}
  })

  it('should handle command success', async () => {
    mockExecResult = { stdout: 'success' }
    const result = await serviceUnderTest()
    expect(result).toBe('success')
  })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|---------|
| Jest test runner | Bun test runner | Bun 1.0 (2023) | 10x faster tests, native TypeScript support |
| c8/nyc for coverage | Bun built-in coverage | Bun 1.1 (2024) | Zero-config, integrated with test runner |
| Manual module mocking | mock.module() | Bun 1.1 (2024) | ESM-compatible, auto-cleanup |
| jest.fn() | mock() (or jest.fn() alias) | Bun 1.0 | Identical API, both work |

**Deprecated/outdated:**
- ts-jest: Bun runs TypeScript natively, no transpilation needed
- --experimental-vm-modules: Node.js flag for ESM, not needed in Bun
- Manual sourcemap generation: Bun auto-generates internal sourcemaps

## Open Questions

Things that couldn't be fully resolved:

1. **Coverage threshold enforcement in CI**
   - What we know: bunfig.toml supports coverageThreshold configuration
   - What's unclear: Whether CI scripts should fail on threshold violations or just warn
   - Recommendation: Start with warning-only (no threshold), document gaps, then set realistic threshold (60-70%) after identifying deferred modules

2. **Which modules to prioritize for testing**
   - What we know: pr-service.ts needs tests (requirement COV-02), git-service.test.ts is the pattern
   - What's unclear: Which other critical modules beyond pr-service
   - Recommendation: Use coverage report to identify high-impact untested modules (agent/mode-manager, sessions/storage, config/storage)

3. **Test file location convention**
   - What we know: Both `__tests__/module.test.ts` and `module.test.ts` patterns exist
   - What's unclear: Which convention to follow for new tests
   - Recommendation: Use `__tests__/` subdirectory pattern (matches git/__tests__, agent/__tests__, cleaner separation)

## Sources

### Primary (HIGH confidence)
- Bun Code Coverage Documentation - https://bun.com/docs/test/code-coverage
- Bun Test Runner Documentation - https://bun.com/docs/test
- Bun Mocking Documentation - https://bun.com/docs/test/mocks
- Bun Coverage Guide - https://bun.com/guides/test/coverage
- Bun Mock Functions Guide - https://bun.com/guides/test/mock-functions

### Secondary (MEDIUM confidence)
- Bun Code Coverage Gap Analysis - https://www.charpeni.com/blog/bun-code-coverage-gap (verified with official docs)
- Coverage Threshold Guide - https://bun.com/guides/test/coverage-threshold

### Tertiary (LOW confidence)
- GitHub Issue #3158 - Support test coverage reporters - https://github.com/oven-sh/bun/issues/3158 (feature discussion)
- GitHub Issue #7254 - Report all files including those without tests - https://github.com/oven-sh/bun/issues/7254 (known limitation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Bun test runner is already in use, verified by package.json and existing tests
- Architecture: HIGH - Patterns extracted from existing test files in the codebase
- Pitfalls: HIGH - Coverage gap issue verified by official docs and community blog, mocking patterns from Bun docs

**Research date:** 2026-02-05
**Valid until:** 2026-03-05 (30 days - Bun is stable, test runner API unlikely to change)
