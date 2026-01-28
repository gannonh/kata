# Domain Pitfalls: Release Automation & Workflow Documentation

**Domain:** Release automation, workflow documentation, statusline integration, CLI onboarding
**Researched:** 2026-01-28
**Confidence:** HIGH (based on Kata's historical issues v1.0.1-1.0.8 and verified sources)

## Executive Summary

This research identifies critical pitfalls when adding release automation and workflow documentation to Kata, drawing from:
- Kata's actual release history (8 patch releases from v1.0.1-1.0.8, mostly path resolution and CI issues)
- GitHub Actions automation patterns
- npm package publishing in CI/CD
- Workflow documentation maintenance
- CLI tool statusline integration

The most dangerous pattern: **path resolution assumptions break in CI**. Kata already experienced this (v1.0.3-1.0.8). Prevention requires CI testing **before** release, not after.

---

## Critical Pitfalls

Mistakes that cause rewrites, rapid patch releases, or production failures.

### Pitfall 1: CI Environment Path Assumptions

**What goes wrong:** Paths that work locally fail in CI because environment variables, working directories, or file system structure differ between local and CI environments.

**Why it happens:**
- Local development uses absolute paths or relies on shell session state
- CI runners have different directory structures and environment setup
- Build processes assume local file locations exist in CI

**Kata experienced this:**
- v1.0.3: Plugin path resolution attempt (failed)
- v1.0.4: Revert path approach, add tests
- v1.0.5: Hidden directories not copied to marketplace
- v1.0.6-v1.0.8: Continued path resolution issues
- **Pattern:** 6 patch releases fixing the same root cause

**Consequences:**
- Rapid patch release cycles (multiple per day)
- User-facing bugs in published artifacts
- Trust erosion (version numbering becomes meaningless)
- CI becomes unreliable gating mechanism

**Prevention:**
1. **Test in CI before releasing** — Run full plugin build and validation in CI
2. **Use CI-compatible paths** — No assumptions about `$HOME`, working directory, or installed tools
3. **Validate artifacts** — CI should test the actual built plugin, not source
4. **Copy/paste protection** — If path resolution requires `resolvePathSync` with extension handling, test it with actual plugin structure in CI

**Detection:**
- CI workflow succeeds but published artifacts fail
- Rapid patch releases with "fix path" or "restore working state" messages
- Local testing passes, CI testing passes, but users report failures
- Build process modifies paths (like `build.js` stripping prefixes) without corresponding CI validation

**Which phase should address:**
- **Phase 0: CI validation** — Before implementing release automation
- **Phase 1: Release workflow** — Build and test artifacts in CI before publishing

---

### Pitfall 2: GitHub Actions Release Trigger Deadlock

**What goes wrong:** Releases created by GitHub Actions don't trigger subsequent `on: release` workflows. The release publishes but post-release automation never runs.

**Why it happens:**
- GitHub prevents infinite loop scenarios where releases trigger releases
- Default `GITHUB_TOKEN` doesn't have permissions to trigger workflow events
- Without custom Personal Access Token (PAT), release workflows complete but don't cascade

**Consequences:**
- Silent failure — release looks successful but downstream automation skipped
- Manual intervention required for every release
- Version tags exist but packages not published (or vice versa)
- Changelog/documentation updates never happen

**Prevention:**
1. **Use PAT with workflow permissions** — Create GitHub Personal Access Token with `workflow` scope
2. **Store as repository secret** — `GH_PAT` or similar, not `GITHUB_TOKEN`
3. **Test trigger chain** — Verify release creation actually triggers publish workflow
4. **Explicit status checks** — Don't rely on implicit workflow chaining
5. **Alternative: Manual release step** — Use `workflow_dispatch` trigger for releases requiring approval

**Detection:**
- CI creates releases but publish workflow never runs
- GitHub Actions UI shows no triggered workflows after release
- Version tags exist but npm/marketplace shows old version
- Release notes generated but not attached to release

**Which phase should address:**
- **Phase 0: CI validation** — Understand trigger chain before implementing
- **Phase 1: Release workflow** — Test end-to-end automation with PAT

---

### Pitfall 3: npm OIDC Authentication Misconceptions

**What goes wrong:** Setting `NODE_AUTH_TOKEN` to empty string prevents OIDC Trusted Publishing from working. npm tries to use the empty token instead of falling back to OIDC.

**Why it happens:**
- Classic npm tokens deprecated in 2026
- OIDC Trusted Publishing requires token variable to be **completely unset**, not empty
- GitHub Actions templates often include `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` which sets empty string when secret missing

**Consequences:**
- Publish fails with authentication error despite OIDC being configured
- Debugging leads down wrong path (checking OIDC config when the problem is token variable)
- First version must be published manually (OIDC only works after Trusted Publisher configured)

**Prevention:**
1. **Unset vs empty** — Only set `NODE_AUTH_TOKEN` if token exists: `if: ${{ secrets.NPM_TOKEN }}`
2. **OIDC-first workflow** — Prefer OIDC Trusted Publishing, not classic tokens
3. **Repository URL exactness** — `package.json` repository.url must exactly match GitHub URL (case-sensitive)
4. **GitHub-hosted runners only** — Self-hosted runners don't support OIDC (as of 2026)
5. **Manual first publish** — Document that first version requires manual publish or classic token

**Detection:**
- CI shows authentication error: "Unable to authenticate"
- OIDC config looks correct but still fails
- `NODE_AUTH_TOKEN` present in env (even if empty)
- Works locally with token, fails in CI with OIDC

**Which phase should address:**
- **Phase 1: Release workflow** — Configure OIDC correctly from start
- **Not applicable to Kata** — Kata uses Claude Code plugin marketplace, not npm, but similar authentication pitfalls may exist

---

### Pitfall 4: Semantic Versioning Automation Without Validation

**What goes wrong:** Automated versioning based on commit messages produces wrong version bumps when commit messages don't match actual changes, or validation is missing.

**Why it happens:**
- Tools like `semantic-release` trust commit message format (`feat:`, `fix:`, `BREAKING CHANGE:`)
- No static analysis confirms commit message matches code changes
- Manual commits can use wrong type (dev thinks "feat" but actually "fix")
- Breaking changes introduced in "fix" commits

**Kata experienced this:**
- Rapid v1.0.x patch releases indicate incomplete testing, not just fixes
- Version numbering confusion (when is it patch vs minor?)
- No automated validation of version appropriateness

**Consequences:**
- Breaking changes released as patches
- Users trust semantic versioning, get surprised by breaks
- Version history becomes meaningless
- Rollback requires multiple versions

**Prevention:**
1. **Validate commit types** — CI checks that `feat:` commits actually add features, `fix:` commits actually fix bugs
2. **Manual bump approval** — Human confirms version bump before release
3. **Changelog review** — Generated changelog must make sense before publish
4. **BREAKING: detection** — CI fails if breaking changes found in non-major version
5. **Test matrix** — Validate new version against previous version's API

**Detection:**
- Patch releases that break existing usage
- Commit messages don't match actual changes
- Multiple patches released same day
- Versions skip numbers (v1.0.3 → v1.0.8)

**Which phase should address:**
- **Phase 1: Release workflow** — Version bump validation before publish
- **Phase 2: Workflow docs** — Document when to use major/minor/patch

---

### Pitfall 5: Workflow Diagrams Diverge from Implementation

**What goes wrong:** Documentation shows one workflow, code implements another. Diagrams become obsolete as code evolves.

**Why it happens:**
- Diagrams drawn once during design, never updated
- No automation linking diagram to code
- Changes to code don't trigger documentation review
- Multiple contributors update code, none update diagrams

**Consequences:**
- Onboarding uses wrong mental model
- Debugging uses incorrect assumptions
- Stakeholders make decisions based on outdated diagrams
- "Documentation says X, code does Y" confusion

**Prevention:**
1. **Co-locate diagrams with code** — Workflow diagram lives with workflow implementation
2. **Review checklist** — PR template requires documentation update for workflow changes
3. **Quarterly review cadence** — Scheduled documentation audit every 3 months
4. **Executable diagrams** — Mermaid/ASCII in markdown, not separate image files
5. **Test references** — Diagram mentions phase numbers, tests validate those phases exist
6. **Living documentation marker** — Date stamp on diagrams: "Last validated: 2026-01-28"

**Detection:**
- User reports: "Documentation says do X but system does Y"
- Code review finds workflow behavior contradicting docs
- Diagram shows 5 phases, ROADMAP.md shows 7 phases
- File paths in diagram don't match actual file structure
- Git blame shows diagram last updated months before workflow code

**Which phase should address:**
- **Phase 2: Workflow docs** — Create diagrams during workflow implementation
- **Phase 3: Documentation maintenance** — Establish review cadence and co-location patterns

---

## Moderate Pitfalls

Mistakes that cause delays, technical debt, or require rework.

### Pitfall 6: .gitignore vs .npmignore Confusion

**What goes wrong:** Build artifacts created during CI are listed in `.gitignore`, so they're not included in published npm package (if `.npmignore` doesn't exist).

**Why it happens:**
- npm honors `.gitignore` when `.npmignore` is missing
- Build process generates `dist/` or similar, which is `.gitignore`'d
- CI builds successfully but published package is incomplete

**Prevention:**
1. **Explicit .npmignore** — Always create `.npmignore`, don't rely on `.gitignore` behavior
2. **Test published tarball** — CI extracts and validates package contents before publish
3. **files field in package.json** — Explicitly list what to include (more reliable than ignore files)

**Detection:**
- Published package smaller than expected
- Users report "module not found" after install
- Local development works, installed package fails

**Which phase should address:**
- **Phase 1: Release workflow** — Validate package contents before publish

---

### Pitfall 7: Statusline Performance Anti-Patterns

**What goes wrong:** Statusline commands that fetch network data (GitHub CI status, etc.) take 1-2 seconds, causing sluggish terminal experience.

**Why it happens:**
- Statusline called frequently (every prompt render)
- Network requests block rendering
- No caching of expensive operations

**Prevention:**
1. **Cache aggressively** — Session-wide caching with multi-tier duration strategies
2. **Async updates** — Return immediately with cached data, update in background
3. **Progressive disclosure** — Show basic info first, detailed info only when expanded
4. **Performance budget** — Statusline must respond <50ms

**Detection:**
- Terminal feels sluggish
- Noticeable delay before prompt appears
- Network requests in statusline code
- Response times >500ms

**Which phase should address:**
- **Phase 3: Statusline integration** — Design for performance from start

---

### Pitfall 8: Onboarding Assumes Expert Context

**What goes wrong:** Documentation/onboarding designed by experts who forget what beginners don't know. Users get stuck on implicit assumptions.

**Why it happens:**
- Author knows domain deeply, assumes basics
- No user testing with actual beginners
- Onboarding reviews only by other experts

**Prevention:**
1. **Beginner review** — Someone unfamiliar with project tests onboarding
2. **Explicit prerequisites** — List required knowledge, tools, accounts
3. **Common errors section** — Document mistakes beginners make
4. **Progressive complexity** — Start with simplest path, add advanced later

**Detection:**
- Support questions about "obvious" things
- Users stuck at same point repeatedly
- "How do I X?" when documentation assumes X is known
- Low completion rate for onboarding flow

**Which phase should address:**
- **Phase 4: UX polish** — User testing and onboarding refinement

---

### Pitfall 9: Version Bump Without Changelog Review

**What goes wrong:** Automated version bump happens, changelog generated, release published — all without human review. Generated changelog may be wrong, misleading, or missing context.

**Why it happens:**
- Full automation removes human checkpoint
- Trust in commit message quality
- "Move fast" culture skips review

**Prevention:**
1. **Changelog approval gate** — Human confirms changelog before publish
2. **Draft release workflow** — Create draft, human reviews, then publish
3. **Commit message quality enforcement** — CI fails on generic messages like "fix stuff"

**Detection:**
- Changelog entries don't make sense to users
- Important changes missing from changelog
- Duplicate entries (commit message ambiguity)

**Which phase should address:**
- **Phase 1: Release workflow** — Add human review checkpoint

---

### Pitfall 10: Missing Integration Test Coverage

**What goes wrong:** Unit tests pass, integration tests missing, so multi-step workflows break in production.

**Why it happens:**
- CI runs unit tests only
- Integration tests slow/complex
- "It works locally" confidence

**Kata experienced this:**
- v1.0.1: CI workflow trigger issues (caught post-release)
- v1.0.3-1.0.8: Path resolution (should have been caught by integration tests)

**Prevention:**
1. **End-to-end test in CI** — Full plugin build → install → invoke → verify
2. **Release candidate testing** — Test actual release artifacts before publish
3. **Integration test suite** — Test multi-step workflows, not just units

**Detection:**
- Rapid patch releases after major release
- "It worked in CI but failed for users"
- Issues only found after publish

**Which phase should address:**
- **Phase 0: CI validation** — Before implementing release automation

---

## Minor Pitfalls

Mistakes that cause annoyance but are fixable.

### Pitfall 11: Hard-Coded Version Numbers in Docs

**What goes wrong:** Documentation includes version-specific examples that become outdated.

**Prevention:**
- Use "latest" instead of version numbers where possible
- Automated doc generation from templates
- Scheduled doc review

**Which phase should address:**
- **Phase 2: Workflow docs** — Use version-agnostic patterns

---

### Pitfall 12: Unclear Versioning Strategy Communication

**What goes wrong:** Users don't know whether to trust semantic versioning, or when breaking changes might happen.

**Prevention:**
- Document versioning policy explicitly
- CHANGELOG.md explains versioning decisions
- Breaking change migration guides

**Which phase should address:**
- **Phase 4: UX polish** — Document versioning guarantees

---

## Phase-Specific Warnings

| Phase Topic                     | Likely Pitfall                                | Mitigation                                                     |
| ------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Phase 0: CI Validation          | Pitfall 1 (path assumptions), Pitfall 10      | Test artifacts in CI environment, not just source              |
| Phase 1: Release Workflow       | Pitfall 2 (trigger deadlock), Pitfall 4       | Use PAT, test trigger chain, validate version bump             |
| Phase 2: Workflow Documentation | Pitfall 5 (diagram divergence)                | Co-locate diagrams, establish review cadence                   |
| Phase 3: Statusline Integration | Pitfall 7 (performance)                       | Cache aggressively, performance budget <50ms                   |
| Phase 4: UX/Onboarding Polish   | Pitfall 8 (expert assumptions), Pitfall 12    | Beginner testing, explicit versioning policy                   |

---

## Kata-Specific Risk Factors

Based on Kata's history and architecture:

### High Risk: Path Resolution in Plugin Distribution
- **Historical precedent:** v1.0.3-1.0.8 all path-related
- **Root cause:** Build system transforms paths (`build.js` strips prefixes), CI doesn't validate transformed artifacts
- **Mitigation:** Phase 0 must validate plugin structure matches what Claude Code expects

### High Risk: Multi-Step Release Workflow
- **Complexity:** Milestone completion → PR merge → CI trigger → version bump → plugin publish → marketplace update
- **Failure modes:** Many points where automation can break silently
- **Mitigation:** Test end-to-end with draft release, validate each step separately

### Medium Risk: Workflow Diagram Maintenance
- **Kata has:** 14 skills, multiple agents, complex orchestration
- **Challenge:** Keeping diagrams synchronized with code as system evolves
- **Mitigation:** Co-locate diagrams with skill/agent files, automated validation

### Low Risk: npm Publishing
- **Not applicable:** Kata uses Claude Code plugin marketplace, not npm
- **But:** Similar authentication pitfalls may exist (API keys, tokens, etc.)

---

## Integration Pitfalls with Existing System

### GitHub Integration + Release Automation
- **Risk:** Milestone → Issue → PR → Release chain has many dependencies
- **What could break:** Phase completes, PR merges, but release workflow doesn't trigger (Pitfall 2)
- **Prevention:** Test full chain from milestone creation to plugin publish

### Statusline + Project State
- **Risk:** Statusline queries `.planning/STATE.md` frequently, could cause performance issues
- **What could break:** File I/O blocking statusline render (Pitfall 7)
- **Prevention:** Cache STATE.md parsing, invalidate only on Write tool use

### Workflow Docs + Kata's XML Workflows
- **Risk:** Workflows use XML for semantic structure, diagrams need to represent this accurately
- **What could break:** Diagram shows steps as sequence, actual workflow has conditionals (Pitfall 5)
- **Prevention:** ASCII/Mermaid diagrams that can show conditionals and loops

---

## Sources

**GitHub Actions:**
- [GitHub Actions release automation trigger issues](https://github.com/orgs/community/discussions/25281)
- [The Pain That is Github Actions](https://www.feldera.com/blog/the-pain-that-is-github-actions)
- [GitHub Actions path resolution issues](https://github.com/actions/runner/issues/2185)
- [GitHub Actions workspace path differences](https://community.sonarsource.com/t/official-sonarcloud-github-action-fails-to-resolve-paths-due-to-workspace-difference/103652)

**npm Publishing:**
- [npm Classic Tokens to OIDC Trusted Publishing troubleshooting](https://dev.to/zhangjintao/from-deprecated-npm-classic-tokens-to-oidc-trusted-publishing-a-cicd-troubleshooting-journey-4h8b)
- [npm Docs: Using private packages in CI/CD](https://docs.npmjs.com/using-private-packages-in-a-ci-cd-workflow/)

**Version Management:**
- [Version Control Best Practices](https://www.modernrequirements.com/blogs/version-control-best-practices/)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Automating Versioning with Semantic Release](https://medium.com/agoda-engineering/automating-versioning-and-releases-using-semantic-release-d16c5672fbe1)

**Workflow Documentation:**
- [Workflow Mistakes: 7 Common Pitfalls](https://q3edge.com/common-workflow-mistakes/)
- [Document Workflow Guide 2026](https://www.proprofskb.com/blog/workflow-documentation/)

**CLI Statusline:**
- [Claude Code Statusline Documentation](https://code.claude.com/docs/en/statusline)
- [ccstatusline performance patterns](https://github.com/sirmalloc/ccstatusline)
- [CLI UX Best Practices for Progress Displays](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays)

**Kata Historical Issues:**
- Kata git log (v1.0.1-v1.0.8 patch releases)
- `.planning/ROADMAP.md` (patch release notes)
- `skills/executing-phases/references/github-integration.md` (integration complexity)
