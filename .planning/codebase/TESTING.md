# Testing Patterns

**Analysis Date:** 2026-01-29

## Test Framework

**Runner:**
- Bun test built-in (no separate test runner)
- Config: Root-level `bun test` command in `package.json`

**Assertion Library:**
- Bun's built-in test module: `import { describe, it, expect } from 'bun:test'`

**Run Commands:**
```bash
bun test              # Run all tests
bun test --watch     # Watch mode (inferred from Bun patterns)
# No coverage command found in scripts - not currently used
```

## Test File Organization

**Location:**
- Co-located with source files in `__tests__/` subdirectories
- Pattern: `src/components/chat/__tests__/turn-utils-grouping.test.ts` alongside `src/components/chat/turn-utils.ts`

**Naming:**
- Suffix: `.test.ts` for test files (not `.spec.ts`)
- Directory: `__tests__/` folder within component/module directory
- Test file name matches implementation with `.test` suffix

**Structure:**
```
packages/ui/src/components/chat/
├── turn-utils.ts
├── TurnCard.tsx
└── __tests__/
    ├── turn-utils-grouping.test.ts
    ├── turn-phase.test.ts
    ├── turn-lifecycle.test.ts
    └── linkify.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'bun:test'
import { groupActivitiesByParent } from '../turn-utils'

describe('groupActivitiesByParent', () => {
  describe('empty and flat cases', () => {
    it('returns empty array for empty input', () => {
      const result = groupActivitiesByParent([])
      expect(result).toEqual([])
    })

    it('returns flat list when no Task tools present', () => {
      const activities = [...]
      const result = groupActivitiesByParent(activities)
      expect(result.length).toBe(3)
    })
  })

  describe('single Task with children', () => {
    it('groups child activities under Task parent', () => {
      // Test implementation
    })
  })
})
```

**Patterns:**
- Use `describe()` for test suites with descriptive names
- Use nested `describe()` for logical grouping of related tests
- Use `it()` for individual test cases with clear intent
- Use `expect()` for assertions with Bun's built-in matchers

## Mocking

**Framework:** No external mocking library
- Tests use factory functions to create test objects
- No Jest mocks or Sinon - pure functions and test data

**Patterns:**
Tests create helper functions to build test data:
```typescript
/**
 * Create a basic activity item for testing
 */
function createActivity(
  overrides: Partial<ActivityItem> = {}
): ActivityItem {
  const id = `activity-${++activityIdCounter}`
  return {
    id,
    type: 'tool',
    status: 'completed',
    toolName: 'Read',
    toolUseId: `tu-${activityIdCounter}`,
    timestamp: Date.now() + activityIdCounter * 100,
    depth: 0,
    ...overrides,
  }
}

/**
 * Create a Task activity (parent tool that groups children)
 */
function createTaskActivity(
  description: string,
  overrides: Partial<ActivityItem> = {}
): ActivityItem {
  return createActivity({
    toolName: 'Task',
    toolInput: { description, subagent_type: 'Explore' },
    ...overrides,
  })
}
```

**What to Mock:**
- Don't mock in unit tests - use test data factories instead
- Tests are for pure functions (no external dependencies)
- Example: `groupActivitiesByParent()` is a pure function that processes arrays

**What NOT to Mock:**
- Don't use mocks for pure utility functions - test with real data
- Don't mock Bun test API (`describe`, `it`, `expect`)
- Focus on testing transformations and algorithms directly

## Fixtures and Factories

**Test Data:**
Factory functions create objects with sensible defaults and allow overrides:
```typescript
let activityIdCounter = 0

function resetCounters() {
  activityIdCounter = 0
}

function createActivity(
  overrides: Partial<ActivityItem> = {}
): ActivityItem {
  const id = `activity-${++activityIdCounter}`
  return {
    id,
    type: 'tool' as ActivityType,
    status: 'completed',
    toolName: 'Read',
    toolUseId: `tu-${activityIdCounter}`,
    timestamp: Date.now() + activityIdCounter * 100,
    depth: 0,
    ...overrides,
  }
}
```

**Location:**
- Helpers defined at top of test file in "Test Helpers" section
- Shared section marked with comment: `// ============================================================================`
- Used by all test suites in the file

**Pattern Example from `turn-utils-grouping.test.ts`:**
```typescript
// ============================================================================
// Test Helpers
// ============================================================================

let activityIdCounter = 0

function resetCounters() {
  activityIdCounter = 0
}

function createActivity(overrides: Partial<ActivityItem> = {}): ActivityItem { ... }
function createTaskActivity(description: string, overrides: Partial<ActivityItem> = {}): ActivityItem { ... }
function createChildActivity(parentToolUseId: string, overrides: Partial<ActivityItem> = {}): ActivityItem { ... }
function createTaskOutputActivity(taskId: string, data: {...}, overrides: Partial<ActivityItem> = {}): ActivityItem { ... }
function createTodoWriteActivity(todos: Array<{...}>, overrides: Partial<ActivityItem> = {}): ActivityItem { ... }
```

## Coverage

**Requirements:**
- No coverage requirement enforced (not in scripts)
- No `.nyc` or coverage config files found

**View Coverage:**
- No coverage command in package.json - tests are unit-tested without formal metrics
- Focus is on critical utility functions: `turn-utils.ts`, `turn-phase.ts`, `linkify.ts`

## Test Types

**Unit Tests:**
- Scope: Pure utility functions (`groupActivitiesByParent()`, `deriveTurnPhase()`, `detectLinks()`)
- Approach: Test inputs and outputs directly with factories
- Example: `turn-utils-grouping.test.ts` tests grouping logic with 30+ test cases
- Files: `packages/ui/src/components/chat/__tests__/turn-utils-grouping.test.ts`

**Integration Tests:**
- Not found in current test files
- No E2E tests in this codebase (Electron app likely has manual testing)

**E2E Tests:**
- Not used - application is Electron desktop app tested manually

## Common Patterns

**Async Testing:**
Not used in current tests (all are synchronous pure functions)
- If needed: Bun supports async test functions: `it('async test', async () => { ... })`

**Error Testing:**
```typescript
it('handles malformed TaskOutput JSON gracefully', () => {
  resetCounters()

  const task = createTaskActivity('Task', {
    content: 'Done\n\nagentId: bad123',
    status: 'completed',
  })

  // TaskOutput with invalid JSON content
  const badTaskOutput = createActivity({
    toolName: 'TaskOutput',
    toolInput: { task_id: 'bad123' },
    content: 'not valid json',
    status: 'completed',
  })

  const activities = [task, badTaskOutput]
  const result = groupActivitiesByParent(activities)

  // Should still work, just without taskOutputData
  expect(result.length).toBe(1)
  const group = result[0] as ActivityGroup
  expect(group.taskOutputData).toBeUndefined()
})
```

**Boundary Testing:**
Tests verify edge cases extensively:
- Empty inputs: `returns empty array for empty input`
- Single items: `handles single child (is both first and last)`
- Out-of-order data: `out-of-order stored messages: children before parent still group correctly`
- Missing references: `shows children with missing parents as orphan activities at root level`

## Test Naming

**Descriptive titles:**
- File level: `turn-utils-grouping.test.ts` (describes what's being tested)
- Suite level: `describe('groupActivitiesByParent', { ... })`
- Category level: `describe('empty and flat cases', { ... })`
- Test level: `it('returns empty array for empty input', () => { ... })`

**Pattern:** Nested describes create readable test reports:
```
groupActivitiesByParent
  empty and flat cases
    ✓ returns empty array for empty input
    ✓ returns flat list when no Task tools present
  single Task with children
    ✓ groups child activities under Task parent
    ✓ maintains chronological order of children within group
  multiple Tasks with children
    ✓ groups each Task with its own children
```

## Test Maintenance

**Reset Between Tests:**
- Counters reset with `resetCounters()` at start of each test
- Prevents ID conflicts: `let activityIdCounter = 0` reset each time
- Example: Each test calls `resetCounters()` before creating activities

**Deterministic IDs:**
- Counter-based IDs: `activity-1`, `tu-1`, `activity-2`, `tu-2`
- Allows predictable assertions: `expect(group.children[0]!.id).toBe(child1.id)`

---

*Testing analysis: 2026-01-29*
