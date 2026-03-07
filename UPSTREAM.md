# Upstream Management

Kata Agents is a fork of Craft Agents. This document describes how to selectively adopt changes from the upstream repository when needed.

## Source Repository

- **URL:** https://github.com/lukilabs/craft-agents-oss
- **Approach:** Fetch by URL on-demand (no persistent remote)

## Checking for Upstream Changes

```bash
# Fetch upstream main into a local branch
git fetch https://github.com/lukilabs/craft-agents-oss.git main:upstream-check

# See what's new
git log upstream-check --oneline -20

# Compare with our main
git log main..upstream-check --oneline
git diff main...upstream-check --stat

# Clean up when done
git branch -D upstream-check
```

## Cherry-Pick Workflow

```bash
# 1. Fetch upstream into a temporary branch
git fetch https://github.com/lukilabs/craft-agents-oss.git main:upstream-check

# 2. Create feature branch from main
git checkout main
git checkout -b feature/upstream-[description]

# 3. Cherry-pick specific commit(s)
git cherry-pick <commit-sha>

# 4. Resolve conflicts if any, then push
git push origin feature/upstream-[description]

# 5. Open PR to main
gh pr create --repo gannonh/kata-agents

# 6. Clean up temporary branch
git branch -D upstream-check
```

## Adoption Criteria

| Change Type | Policy | Rationale |
|-------------|--------|-----------|
| Bug fixes | Adopt readily | Direct user benefit, low risk |
| Security patches | Adopt immediately | Critical for user safety |
| SDK updates | Evaluate carefully | Test before adopting, may have breaking changes |
| New features | Case-by-case | Evaluate fit with Kata direction |
| Refactors | Generally skip | Adds merge complexity without user value |
| Branding changes | Never adopt | Defeats purpose of fork |

## Conflict Resolution

When cherry-picking causes conflicts:

1. **Resolve in the feature branch, not in main** - Keep main clean until PR is approved
2. **If conflict is extensive, consider skipping that commit** - Not all upstream changes are worth the complexity
3. **Document significant conflict resolutions in PR description** - Future maintainers need context

### Common Conflict Areas

- `apps/electron/electron-builder.yml` - Bundle ID, product name differ
- `apps/electron/resources/` - Icons and branding assets
- `packages/shared/src/branding.ts` - Service URLs and domain references

## Review Cadence

| Frequency | Action |
|-----------|--------|
| Monthly | Check upstream commits, identify candidates for adoption |
| As-needed | Cherry-pick security fixes immediately |
| Quarterly | Evaluate SDK version alignment with upstream |

## Commit Message Convention

When cherry-picking from upstream:

```
feat(upstream): [description]

Cherry-picked from lukilabs/craft-agents-oss@<sha>
Original commit: <original message>

Adopted because: [rationale]
```

---
*Last updated: 2026-01-29*
