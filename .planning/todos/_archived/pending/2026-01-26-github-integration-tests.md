---
created: 2026-01-26
area: testing
priority: medium
---

# Add GitHub API Integration Tests

## Problem

Current tests for GitHub integration (phase issues, milestones, labels) are **content verification tests** — they check that skill files contain the right patterns but don't verify actual GitHub API behavior.

If the GitHub API changes or shell commands have bugs, these tests would still pass while features are broken.

## Solution

Add true integration tests that:

1. Invoke skills or underlying `gh` commands
2. Create real GitHub artifacts (milestones, issues, labels)
3. Query GitHub API to verify artifacts exist with correct properties
4. Clean up after themselves

## Implementation Notes

```javascript
describe('Phase Issue Creation (Integration)', () => {
  const TEST_REPO = 'kata-test-sandbox';

  afterEach(async () => {
    // Cleanup test artifacts
  });

  it('creates phase issues with correct properties', async () => {
    // 1. Create milestone via kata
    // 2. Query GitHub API directly
    // 3. Assert real state
  });
});
```

## Considerations

| Concern | Approach |
|---------|----------|
| Test isolation | Dedicated test repo or unique prefixes per run |
| CI authentication | `GH_TOKEN` secret in GitHub Actions |
| Rate limits | Batch cleanup, reuse test repo |
| Flakiness | Retry logic, explicit waits |

## Scope

Tests needed for:
- [ ] GitHub Milestone creation
- [ ] Phase issue creation with `phase` label
- [ ] Issue body contains goal and success criteria
- [ ] Issue assigned to correct milestone
- [ ] issueMode config (auto/ask/never) behavior

## Context

Identified during Phase 3 UAT (2026-01-26). Current content verification tests in `tests/skills/adding-milestones.test.js` are insufficient for catching runtime integration issues.
