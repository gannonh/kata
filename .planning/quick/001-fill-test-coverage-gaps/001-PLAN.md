---
phase: 001-fill-test-coverage-gaps
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/shared/src/git/__tests__/pr-service.test.ts
autonomous: true

must_haves:
  truths:
    - "getPrStatus returns PrInfo when gh CLI returns valid JSON"
    - "getPrStatus returns null when gh CLI not installed (ENOENT)"
    - "getPrStatus returns null when no PR exists for branch"
    - "getPrStatus returns null when gh CLI not authenticated"
    - "Unexpected errors are logged and return null"
  artifacts:
    - path: "packages/shared/src/git/__tests__/pr-service.test.ts"
      provides: "Unit tests for pr-service.ts"
      min_lines: 100
  key_links:
    - from: "packages/shared/src/git/__tests__/pr-service.test.ts"
      to: "packages/shared/src/git/pr-service.ts"
      via: "import getPrStatus"
      pattern: "import.*getPrStatus.*from.*pr-service"
---

<objective>
Add unit tests for `pr-service.ts` which currently has zero test coverage.

Purpose: The PR service is critical for the Git Integration feature. Without tests, regressions in error handling or parsing could break the PR status display silently.

Output: Comprehensive test file at `packages/shared/src/git/__tests__/pr-service.test.ts` covering success and all error paths.
</objective>

<context>
@packages/shared/src/git/pr-service.ts
@packages/shared/src/git/__tests__/git-service.test.ts
@packages/shared/src/git/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create pr-service.test.ts with mocked execFileAsync</name>
  <files>packages/shared/src/git/__tests__/pr-service.test.ts</files>
  <action>
Create a test file following the patterns in git-service.test.ts.

Key approach: Mock `execFileAsync` at the module level using `mock.module()` since pr-service uses `promisify(execFile)`. This avoids needing real git repos or gh CLI.

Test cases to implement:

1. **Success path:**
   - Mock stdout with valid JSON matching PrInfo structure
   - Verify parsed object matches expected PrInfo

2. **ENOENT (gh not installed):**
   - Mock error with code: 'ENOENT'
   - Verify returns null (not throw)

3. **No PR found:**
   - Mock error with stderr containing 'no pull requests found'
   - Verify returns null

4. **Not authenticated:**
   - Mock error with stderr containing 'not logged into'
   - Verify returns null

5. **Unexpected error:**
   - Mock error with unknown code/message
   - Verify returns null and logs to console.error

Structure the file with:
- Clear describe blocks matching error categories
- beforeEach to reset mocks between tests
- Use `mock()` from bun:test for console.error in unexpected error test

DO NOT use real file system operations like git-service.test.ts does. This is a pure unit test with mocked child_process.
  </action>
  <verify>
Run: `bun test packages/shared/src/git/__tests__/pr-service.test.ts`
All tests pass.
  </verify>
  <done>
pr-service.test.ts exists with tests for:
- Success path returning PrInfo
- ENOENT returning null
- No PR found returning null
- Not authenticated returning null
- Unexpected error returning null and logging
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify coverage improvement</name>
  <files>packages/shared/src/git/__tests__/pr-service.test.ts</files>
  <action>
Run coverage report focused on the git package:
`bun test packages/shared/src/git --coverage`

Verify pr-service.ts now shows coverage for:
- The try block (success path)
- Each catch condition (ENOENT, no PR, not authenticated, unexpected)

If any branches are uncovered, add additional test cases to cover them.
  </action>
  <verify>
Run: `bun test packages/shared/src/git --coverage`
pr-service.ts shows line coverage >= 90%
  </verify>
  <done>
pr-service.ts has comprehensive test coverage. Coverage report shows all major code paths are exercised.
  </done>
</task>

</tasks>

<verification>
- `bun test packages/shared/src/git` passes with no failures
- `bun test packages/shared/src/git --coverage` shows pr-service.ts covered
</verification>

<success_criteria>
- pr-service.test.ts exists with at least 5 test cases
- All tests pass
- pr-service.ts coverage >= 90%
- No changes to pr-service.ts source (tests only)
</success_criteria>

<output>
After completion, create `.planning/quick/001-fill-test-coverage-gaps/001-SUMMARY.md`
</output>
