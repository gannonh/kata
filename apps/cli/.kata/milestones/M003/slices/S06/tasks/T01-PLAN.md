# T01: Write failing tests for Linear cross-linking helpers

**Slice:** S06
**Milestone:** M003

## Goal
Establish the contract for Linear cross-linking via failing tests before any implementation.

## Must-Haves

### Truths
- `buildLinearReferencesSection(["KAT-42"])` returns a markdown section containing `Closes KAT-42`
- `buildLinearReferencesSection([])` returns empty string
- `shouldCrossLink({ linear_link: true }, "linear")` returns true
- `shouldCrossLink({ linear_link: true }, "file")` returns false
- `shouldCrossLink({ linear_link: false }, "linear")` returns false
- `shouldCrossLink({}, "linear")` returns false

### Artifacts
- `src/resources/extensions/kata/tests/linear-crosslink.test.ts` — test file with imports from `../linear-crosslink.js`

### Key Links
- `linear-crosslink.test.ts` → `linear-crosslink.ts` via import (MODULE_NOT_FOUND initially)

## Steps
1. Create `linear-crosslink.test.ts` with test cases for `shouldCrossLink`, `buildLinearReferencesSection`
2. Run tests — confirm MODULE_NOT_FOUND failure
3. Verify TypeScript compilation of the test file syntax

## Context
- Follow the same TDD pattern as T01 in S05 (pr-command.test.ts)
- The test file imports from `../linear-crosslink.js` which doesn't exist yet
