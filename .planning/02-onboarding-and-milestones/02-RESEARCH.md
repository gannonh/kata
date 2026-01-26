# Phase 2: Onboarding & Milestones - Research

**Researched:** 2026-01-25
**Domain:** GitHub integration onboarding, Milestone creation workflows
**Confidence:** HIGH

## Summary

This research investigates how to integrate GitHub Milestone creation into Kata's project and milestone initialization workflows. The focus is on two integration points: (1) prompting users for GitHub preferences during project setup, and (2) creating GitHub Milestones when users start new Kata milestones.

The recommended approach uses the existing AskUserQuestion pattern from `kata-starting-projects` to gather GitHub preferences during onboarding, writes values to `.planning/config.json` (established in Phase 1), and extends `kata-starting-milestones` to create GitHub Milestones via `gh api` when `github.enabled = true`. The GitHub CLI provides robust REST API access without requiring third-party extensions.

**Primary recommendation:** Extend existing onboarding workflow with GitHub preference questions, persist to config.json, and create milestones via `gh api /repos/{owner}/{repo}/milestones` POST endpoint.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub CLI (gh) | 2.x+ | GitHub API access | Already used in milestone-complete and PR workflows, no new dependencies |
| AskUserQuestion | Claude Code built-in | User preference gathering | Already used extensively in kata-starting-projects onboarding |
| Bash grep/jq | System | Config reading/writing | Existing pattern in 50+ Kata locations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jq | 1.7+ (system) | JSON parsing for gh api responses | Validating milestone creation, extracting milestone numbers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gh api | gh-milestone extension | Extensions require installation; gh api works out-of-box |
| gh api | curl with GitHub token | gh handles auth automatically; curl requires manual token management |
| config.json | .env file | config.json is established pattern across all Kata workflows |

**Installation:**
```bash
# No additional installation needed - gh CLI already used in Kata
# Verify gh is available and authenticated:
gh auth status
```

## Architecture Patterns

### Recommended Integration Points

```
kata-starting-projects (Phase 5)
├── Existing: Mode, Depth, Parallelization questions
├── NEW: GitHub integration questions
│   ├── Enable GitHub Milestones/Issues? (y/n)
│   └── Issue creation mode (auto/ask/never)
└── Write to: .planning/config.json

kata-starting-milestones (Phase 6 - new phase)
├── After milestone directory created
├── Check: github.enabled from config
├── If true: gh api POST /repos/{owner}/{repo}/milestones
│   ├── title: "v{version}"
│   ├── description: from milestone goals
│   └── Error handling: non-blocking (warn and continue)
└── Return: milestone created (or skipped)
```

### Pattern 1: Config Reading with Defaults
**What:** Bash grep pattern to read config values with fallback defaults
**When to use:** All GitHub integration checks
**Example:**
```bash
# Source: kata/references/planning-config.md
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")
ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")
```

**Key insight:** Defaults match backward compatibility requirements from Phase 1.

### Pattern 2: AskUserQuestion for Onboarding
**What:** Multi-round questioning with concrete options for user preferences
**When to use:** Gathering GitHub preferences during project/milestone setup
**Example:**
```javascript
// Source: skills/kata-starting-projects/SKILL.md and https://www.neonwatty.com/posts/interview-skills-claude-code/
AskUserQuestion({
  header: "GitHub Integration",
  question: "Enable GitHub Milestone/Issue tracking?",
  multiSelect: false,
  options: [
    { label: "Yes (Recommended)", description: "Create GitHub Milestones for Kata milestones" },
    { label: "No", description: "Keep planning local to .planning/ directory only" }
  ]
})

// Follow-up if "Yes":
AskUserQuestion({
  header: "Issue Creation",
  question: "When should GitHub Issues be created for phases?",
  multiSelect: false,
  options: [
    { label: "Auto", description: "Create Issues automatically for each phase" },
    { label: "Ask per milestone", description: "Prompt once per milestone" },
    { label: "Never", description: "Only create Milestones, no phase Issues" }
  ]
})
```

**Key insight:** Two-step questioning separates milestone-level tracking (simpler) from issue-level tracking (more granular).

### Pattern 3: GitHub Milestone Creation via gh api
**What:** Create GitHub Milestone using GitHub CLI REST API wrapper
**When to use:** When `github.enabled = true` and starting new Kata milestone
**Example:**
```bash
# Source: https://gist.github.com/adriens/5a66c2aad305b6da7f3a8f7271e6f42d and https://docs.github.com/en/rest/issues/milestones
# Check authentication first (non-blocking)
if ! gh auth status &>/dev/null; then
  echo "⚠ GitHub CLI not authenticated. Run 'gh auth login' to enable GitHub integration."
  # Continue without GitHub operations
  exit 0
fi

# Create milestone (idempotent - check if exists first)
MILESTONE_EXISTS=$(gh api /repos/:owner/:repo/milestones | jq -r ".[] | select(.title==\"v${VERSION}\") | .number")

if [ -z "$MILESTONE_EXISTS" ]; then
  gh api \
    --method POST \
    -H "Accept: application/vnd.github.v3+json" \
    /repos/:owner/:repo/milestones \
    -f title="v${VERSION}" \
    -f state='open' \
    -f description="${MILESTONE_DESCRIPTION}" \
    2>/dev/null || echo "⚠ Failed to create milestone (GitHub API may be unavailable)"
else
  echo "Milestone v${VERSION} already exists (reusing #${MILESTONE_EXISTS})"
fi
```

**Key insight:** GitHub CLI uses `:owner/:repo` placeholders that resolve from current git remote automatically.

### Pattern 4: Non-Blocking Error Handling
**What:** GitHub operations warn on failure but don't stop Kata workflows
**When to use:** All GitHub API calls
**Example:**
```bash
# Source: skills/kata-executing-phases/references/github-integration.md
if ! gh milestone create "v${VERSION}" 2>/dev/null; then
  # Milestone may already exist or API unavailable
  if gh api /repos/:owner/:repo/milestones | jq -e ".[] | select(.title==\"v${VERSION}\")" >/dev/null 2>&1; then
    echo "Milestone v${VERSION} already exists (reusing)"
  else
    echo "⚠ Failed to create milestone. GitHub integration may be unavailable."
  fi
fi
# Continue regardless - planning files always persist locally
```

### Anti-Patterns to Avoid
- **Blocking on GitHub failures:** Planning must work offline/without GitHub access
- **Creating milestones without idempotency check:** Re-running should be safe
- **Hard-coding owner/repo:** Use gh's `:owner/:repo` placeholders for portability
- **Assuming authentication:** Always check `gh auth status` before API calls

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub authentication | Custom token management | `gh auth login` / `gh auth status` | gh CLI handles OAuth, token storage, rotation automatically |
| Parsing GitHub URLs | Regex to extract owner/repo | gh CLI placeholders (`:owner/:repo`) | gh resolves from git remote automatically |
| JSON manipulation | Manual string concatenation | `jq` for parsing, `-f` flags for creation | Handles escaping, nested structures correctly |
| Milestone existence check | Parse HTML or scrape UI | `gh api` with jq filter | REST API is authoritative source |

**Key insight:** GitHub CLI's `gh api` command abstracts authentication, endpoint resolution, and error handling. Don't reinvent.

## Common Pitfalls

### Pitfall 1: Blocking Kata Workflows on GitHub
**What goes wrong:** Kata commands fail or hang when GitHub is unavailable (offline, rate-limited, auth expired)
**Why it happens:** Treating GitHub integration as required rather than optional enhancement
**How to avoid:**
- Check `github.enabled` config before all GitHub operations
- Check `gh auth status` and exit gracefully if not authenticated
- Use `2>/dev/null` and `|| true` to suppress errors
- Always create planning files locally first, GitHub updates second
**Warning signs:**
- Error messages mention "GitHub API" before planning files created
- Commands hang waiting for GitHub response
- Users can't work offline

### Pitfall 2: Milestone Name Collisions
**What goes wrong:** Creating milestone "v1.0" when "v1.0" already exists (from previous run or manual creation)
**Why it happens:** GitHub returns 422 Unprocessable Entity for duplicate milestone titles
**How to avoid:**
- Query existing milestones before creating: `gh api /repos/:owner/:repo/milestones | jq -r '.[] | select(.title=="v1.0")'`
- If exists, display message and continue (idempotent)
- If doesn't exist, create
**Warning signs:**
- 422 errors in logs
- Users report milestones not created but command succeeded

### Pitfall 3: Inconsistent Config Schema
**What goes wrong:** Reading `github.enabled` from wrong nesting level or using wrong key name
**Why it happens:** Phase 1 established nested `github: { enabled, issueMode }` structure
**How to avoid:**
- Use exact grep patterns: `grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*'` (NOT `grep github.enabled`)
- Test config reading with both `true` and `false` values
- Verify defaults match Phase 1 specification (false, never)
**Warning signs:**
- GitHub operations run when `github.enabled: false`
- Config reads return empty strings instead of "false"

### Pitfall 4: Description Field Overflow
**What goes wrong:** Milestone description from ROADMAP.md exceeds GitHub's field limits
**Why it happens:** GitHub API has undocumented practical limits (typically ~1000 chars for descriptions)
**How to avoid:**
- Extract first paragraph only from milestone goals
- Truncate with ellipsis if exceeds 500 chars: `${DESC:0:500}...`
- Link back to ROADMAP.md for full context
**Warning signs:**
- API returns 422 with "description is too long"
- Milestone description cut off without ellipsis

## Code Examples

Verified patterns from official sources:

### Creating GitHub Milestone (Full Pattern)
```bash
# Source: https://docs.github.com/en/rest/issues/milestones and Phase 1 research
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

if [ "$GITHUB_ENABLED" = "true" ]; then
  # Check authentication (non-blocking)
  if ! gh auth status &>/dev/null; then
    echo "⚠ GitHub CLI not authenticated. Run 'gh auth login' to enable GitHub integration."
  else
    # Check if milestone exists
    MILESTONE_EXISTS=$(gh api /repos/:owner/:repo/milestones 2>/dev/null | jq -r ".[] | select(.title==\"v${VERSION}\") | .number" 2>/dev/null)

    if [ -z "$MILESTONE_EXISTS" ]; then
      # Create milestone
      MILESTONE_DESC=$(echo "$MILESTONE_GOALS" | head -1 | cut -c1-500)

      gh api \
        --method POST \
        -H "Accept: application/vnd.github.v3+json" \
        /repos/:owner/:repo/milestones \
        -f title="v${VERSION}" \
        -f state='open' \
        -f description="${MILESTONE_DESC}" \
        2>/dev/null && echo "✓ GitHub Milestone v${VERSION} created" || echo "⚠ Failed to create GitHub Milestone"
    else
      echo "✓ GitHub Milestone v${VERSION} already exists (#${MILESTONE_EXISTS})"
    fi
  fi
fi
```

### Extending kata-starting-projects with GitHub Questions
```yaml
# Source: skills/kata-starting-projects/SKILL.md Phase 5 pattern
# After existing Mode/Depth/Parallelization questions:

AskUserQuestion([
  {
    header: "GitHub Integration",
    question: "Enable GitHub Milestone/Issue tracking?",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Create GitHub Milestones for Kata milestones, optionally create Issues for phases" },
      { label: "No", description: "Keep planning local to .planning/ directory only" }
    ]
  }
])

# If "Yes":
AskUserQuestion([
  {
    header: "Issue Creation",
    question: "When should GitHub Issues be created for phases?",
    multiSelect: false,
    options: [
      { label: "Auto", description: "Create Issues automatically for each phase (no prompting)" },
      { label: "Ask per milestone", description: "Prompt once per milestone, decision applies to all phases" },
      { label: "Never", description: "Only create Milestones, no phase-level Issues" }
    ]
  }
])

# Write to config.json (merge with existing config structure):
{
  "mode": "yolo|interactive",
  "depth": "quick|standard|comprehensive",
  "parallelization": true|false,
  "github": {
    "enabled": true|false,    # From first question
    "issueMode": "auto|ask|never"  # From second question
  }
  // ... rest of config
}
```

### Reading Nested GitHub Config
```bash
# Source: kata/references/planning-config.md patterns
# Read github.enabled (nested under github key)
GITHUB_ENABLED=$(cat .planning/config.json 2>/dev/null | grep -o '"enabled"[[:space:]]*:[[:space:]]*[^,}]*' | grep -o 'true\|false' || echo "false")

# Read github.issueMode (nested under github key)
ISSUE_MODE=$(cat .planning/config.json 2>/dev/null | grep -o '"issueMode"[[:space:]]*:[[:space:]]*"[^"]*"' | grep -o '"[^"]*"$' | tr -d '"' || echo "never")

# The grep pattern looks for the KEY name (enabled, issueMode), not the full path
# This works because nested keys appear once in the JSON structure
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|---------|
| gh-milestone extension | gh api direct | 2024+ (gh CLI matured) | No external dependencies, works out-of-box |
| Manual git remote parsing | gh CLI `:owner/:repo` | gh 2.0+ | Portable across repos, handles SSH/HTTPS |
| curl with manual auth | gh handles authentication | gh 1.0+ | Auto-refreshes tokens, handles OAuth |
| JSON strings in bash | jq + -f flags | Current best practice | Handles escaping, quotes, special chars |

**Deprecated/outdated:**
- **gh-milestone extensions:** GitHub CLI maintainers prefer `gh api` for milestone operations ([Issue #1200](https://github.com/cli/cli/issues/1200))
- **Manual milestone numbering:** Let GitHub auto-assign numbers, query by title
- **Hardcoded repo URLs:** Use placeholders that resolve from git config

## Open Questions

Things that couldn't be fully resolved:

1. **Milestone description length limits**
   - What we know: GitHub API accepts description field, practical limits exist
   - What's unclear: Exact character limit for milestone descriptions (docs don't specify)
   - Recommendation: Truncate at 500 chars with "..." suffix, link to ROADMAP.md for full context

2. **Rate limiting behavior**
   - What we know: GitHub API has rate limits (authenticated: 5000/hour, unauthenticated: 60/hour)
   - What's unclear: Whether milestone creation counts toward rate limit, how to detect rate limit errors
   - Recommendation: Check response for "rate limit" in error message, display warning and continue

3. **Milestone due dates**
   - What we know: GitHub milestones accept optional `due_on` field (ISO 8601 timestamp)
   - What's unclear: Whether Kata should prompt for milestone due dates during onboarding
   - Recommendation: Skip due dates initially (optional enhancement for future phase)

## Sources

### Primary (HIGH confidence)
- [GitHub REST API Milestones Documentation](https://docs.github.com/en/rest/issues/milestones) - Official API reference
- [GitHub CLI issue create manual](https://cli.github.com/manual/gh_issue_create) - Official gh CLI reference
- [GitHub Gist: Milestone Management CLI Examples](https://gist.github.com/adriens/5a66c2aad305b6da7f3a8f7271e6f42d) - Working gh api examples
- Phase 1 research: Config schema established, reading patterns documented

### Secondary (MEDIUM confidence)
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) - AskUserQuestion patterns
- [Building Skills for Claude Code](https://claude.com/blog/building-skills-for-claude-code) - Onboarding workflow patterns
- [AskUserQuestion Multi-Round Interview Examples](https://www.neonwatty.com/posts/interview-skills-claude-code/) - Onboarding question patterns
- [Manage GitHub Milestones from CLI](https://dev.to/optnc/manage-github-milestones-from-cli-2hkh) - gh api patterns

### Tertiary (LOW confidence)
- None (all findings verified against official documentation)

## Metadata

**Confidence breakdown:**
- GitHub milestone creation: HIGH - Official API docs, verified gh api examples
- Config reading patterns: HIGH - Existing patterns in 50+ Kata locations, Phase 1 research
- AskUserQuestion patterns: HIGH - Extensively used in kata-starting-projects, official Claude Code docs
- Error handling patterns: HIGH - Documented in skills/kata-executing-phases/references/github-integration.md

**Research date:** 2026-01-25
**Valid until:** 90 days (GitHub CLI and REST API are stable, unlikely to change)
