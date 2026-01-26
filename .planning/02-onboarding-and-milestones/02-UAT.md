---
status: complete
phase: 02-onboarding-and-milestones
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-01-25T19:30:00Z
updated: 2026-01-25T20:15:00Z
---

## Tests

### 1. GitHub Tracking Question in Project Setup
expected: When running `/kata:starting-projects`, Phase 5 includes "Enable GitHub Milestone/Issue tracking?" question with Yes/No options
result: pass

### 2. Issue Creation Follow-up Question
expected: If user selects "Yes" to GitHub Tracking, a follow-up question asks "When should GitHub Issues be created for phases?" with Auto, Ask per milestone, and Never options
result: pass

### 3. GitHub Config Saved to config.json
expected: After project setup completes with GitHub enabled, `.planning/config.json` contains `"github": { "enabled": true, "issueMode": "..." }` matching user selections
result: pass
evidence: config.json contains `"github": { "enabled": true, "issueMode": "auto" }`

### 4. GitHub Milestone Created on New Milestone
expected: When running `/kata:starting-milestones` with `github.enabled=true` in config, a GitHub Milestone is created via `gh api` with title matching version (e.g., v1.2.0) and description from milestone goal
result: fail
reason: No GitHub repo exists. Onboarding asks about GitHub preferences but doesn't set up or verify a GitHub remote. Without a repo, `gh api /repos/:owner/:repo/milestones` has no target.

### 5. Non-Blocking Error When gh Not Authenticated
expected: If `gh auth status` fails (not logged in), milestone creation shows a warning "GitHub CLI not authenticated" but Kata workflow continues without blocking
result: blocked
reason: Blocked by Test 4 - no GitHub repo to test against

### 6. Idempotent Milestone Creation
expected: Running `/kata:starting-milestones` twice for the same version doesn't create duplicate GitHub Milestones - it detects existing milestone and skips creation
result: blocked
reason: Blocked by Test 4 - no GitHub repo to test against

## Summary

total: 6
passed: 3
failed: 1
blocked: 2

## Gaps

### GAP-01: Missing GitHub Repo Setup in Onboarding

**Severity:** High (blocks all GitHub integration features)

**Description:** The onboarding flow asks "Enable GitHub Milestone/Issue tracking?" but doesn't ensure a GitHub repository exists. The milestone creation code in `kata-starting-milestones` assumes a repo is already configured.

**Root Cause:** Onboarding config questions (02-01) and milestone creation (02-02) were implemented without a prerequisite step to:
1. Check if a GitHub remote exists (`git remote -v`)
2. Offer to create a repo with `gh repo create` if needed
3. Or link to an existing repo

**Impact:** All GitHub integration features (Milestones, Issues, PRs) are non-functional for new projects until a GitHub repo is manually created.

**Fix Required:** Add GitHub repo setup step to onboarding before asking about Milestone/Issue preferences. Either:
- Detect existing remote and proceed
- Offer `gh repo create` for new projects
- Skip GitHub questions entirely if no repo and user declines to create one
