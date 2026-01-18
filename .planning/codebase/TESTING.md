# Testing Patterns

**Analysis Date:** 2026-01-16

## Test Framework

**Status: No automated test suite exists.**

This is a meta-prompting system consisting of Markdown prompts, not executable code. The "tests" are:
1. Manual execution of `/kata:*` commands in Claude Code
2. Verification steps embedded in PLAN.md tasks
3. Success criteria checklists in workflows

**The one JavaScript file** (`bin/install.js`) has no unit tests.

## Testing Philosophy

GSD uses **inline verification** rather than a separate test suite:

```xml
<task type="auto">
  <name>Create login endpoint</name>
  <action>POST endpoint accepting {email, password}</action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200</verify>
  <done>Valid credentials -> 200 + cookie</done>
</task>
```

Each task includes:
- `<verify>` — Command or check to prove completion
- `<done>` — Acceptance criteria (measurable state)

## TDD Integration

GSD supports TDD for **target projects** (projects built using GSD), not for GSD itself.

### TDD Detection Heuristic

**Heuristic:** Can you write `expect(fn(input)).toBe(output)` before writing `fn`?
- Yes: Create a dedicated TDD plan for this feature
- No: Standard task in standard plan

### TDD Plan Structure

```markdown
---
phase: XX-name
plan: NN
type: tdd
---

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
