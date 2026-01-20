# TDD Execution

RED-GREEN-REFACTOR cycle for test-driven development plans.

## When TDD Applies

Check for `tdd="true"` attribute on task, or `type: tdd` in plan frontmatter.

**TDD Detection Heuristic:**
> Can you write `expect(fn(input)).toBe(output)` before writing `fn`?

- YES: TDD plan (one feature per plan)
- NO: Standard plan

---

## TDD Cycle

### 1. Check Test Infrastructure (if first TDD task)

Detect project type and install test framework if needed:

```bash
# Detect from project files
ls package.json requirements.txt go.mod Cargo.toml 2>/dev/null
```

| Project Type | Framework | Install |
|--------------|-----------|---------|
| Node.js/TypeScript | Jest or Vitest | `npm install -D jest` |
| Python | pytest | `pip install pytest` |
| Go | testing (built-in) | N/A |
| Rust | cargo test (built-in) | N/A |

This is part of the RED phase, not a separate task.

### 2. RED - Write Failing Test

1. Read `<behavior>` element in plan for test specification
2. Create test file if doesn't exist (follow project conventions)
3. Write test(s) that describe expected behavior
4. Run tests - **MUST fail**
5. Commit: `test({phase}-{plan}): add failing test for [feature]`

**If test passes in RED phase:**
- Test is wrong, or
- Feature already exists

Investigate before proceeding.

### 3. GREEN - Implement to Pass

1. Read `<implementation>` element in plan for guidance
2. Write minimal code to make test pass
3. Run tests - **MUST pass**
4. Commit: `feat({phase}-{plan}): implement [feature]`

**If test doesn't pass:**
Debug, keep iterating until green. Do not commit until green.

### 4. REFACTOR (if needed)

1. Clean up code if obvious improvements
2. Run tests - **MUST still pass**
3. Commit only if changes made: `refactor({phase}-{plan}): clean up [feature]`

**If tests fail in REFACTOR phase:**
Undo refactor. Refactor was premature.

---

## TDD Commit Pattern

Each TDD task produces 2-3 atomic commits:

1. `test({phase}-{plan}): add failing test for X`
2. `feat({phase}-{plan}): implement X`
3. `refactor({phase}-{plan}): clean up X` (optional)

**Standard plans** have different pattern:
- Multiple tasks, 1 commit per task
- Typically 2-4 commits total

---

## Context Budget

TDD requires 2-3 execution cycles (RED-GREEN-REFACTOR), each with:
- File reads
- Test runs
- Potential debugging

This consumes 40-50% of context for a single feature.

**Why TDD gets dedicated plans:**
- Ensures full quality throughout the cycle
- Prevents context exhaustion mid-cycle
- Clean commit history per feature

---

## TDD Plan Structure

Plans with `type: tdd` have special sections:

```xml
<objective>
Implement [feature] using TDD (RED - GREEN - REFACTOR)
</objective>

<behavior>
Expected behavior specification for tests.

Given [precondition]
When [action]
Then [expected outcome]
</behavior>

<implementation>
Guidance for making tests pass.
Technical approach, libraries to use, patterns to follow.
</implementation>
```

---

## Example TDD Execution

**Plan: Password hashing for user registration**

```
## RED Phase

Reading <behavior> section...
Expected: hashPassword(plain) returns bcrypt hash
Expected: verifyPassword(plain, hash) returns true for match

Creating test file: src/lib/auth.test.ts

```typescript
import { hashPassword, verifyPassword } from './auth';

describe('password hashing', () => {
  it('hashes password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('verifies correct password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('secret123');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

Running: npm test
Result: FAILED (hashPassword is not defined)

Commit: test(02-03): add failing test for password hashing

---

## GREEN Phase

Reading <implementation> section...
Guidance: Use bcrypt with cost factor 10

Creating: src/lib/auth.ts

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

Running: npm test
Result: PASSED (3 tests)

Commit: feat(02-03): implement password hashing

---

## REFACTOR Phase

Reviewing code... No obvious improvements needed.
Skipping refactor commit.

TDD cycle complete.
```

---

## Error Handling Summary

| Phase | Expected Result | If Wrong |
|-------|-----------------|----------|
| RED | Tests fail | Investigate - test wrong or feature exists |
| GREEN | Tests pass | Debug and iterate until green |
| REFACTOR | Tests still pass | Undo refactor |
