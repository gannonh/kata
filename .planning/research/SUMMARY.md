# Research Summary: v1.3.0 Release Automation & Workflow Documentation

**Milestone:** v1.3.0
**Synthesized:** 2026-01-28
**Overall Confidence:** HIGH

---

## Executive Summary

Kata v1.3.0 requires minimal new technology but careful integration work. The project already has 90% of the infrastructure needed for release automation (GitHub Actions, `gh` CLI, CI/CD pipeline). This milestone focuses on **making what exists more visible and systematic** rather than building new infrastructure.

**The core insight:** Kata's release pain points aren't technical—they're process visibility gaps. Users can't see how Kata works internally (workflow documentation missing). Releases require manual steps that could be automated (milestone → publish flow). The statusline shows generic info instead of project-specific context.

**The architectural approach:** Extend Kata's existing multi-agent orchestration pattern. New skills (`kata-managing-releases`, `kata-documenting-workflows`) spawn specialized agents (`kata-release-manager`, `kata-workflow-documenter`) to handle release state machines and diagram generation. This preserves Kata's thin orchestrator pattern while adding release automation and documentation capabilities.

**Critical risk:** Path resolution failures. Kata already experienced this with 6 patch releases (v1.0.3-1.0.8) fixing path issues. The build system transforms paths (`@~/.claude/kata/` → `@./kata/`) but CI doesn't validate transformed artifacts. Prevention requires **CI testing of actual plugin artifacts before release**, not just source code.

---

## Key Findings by Research Area

### From STACK.md: Technology Choices

**Core additions (3 dependencies):**
1. **Mermaid.js v11.x** — Interactive flowcharts for web/GitHub (72k stars, industry standard)
2. **Diagon** — ASCII diagrams for terminal/CLI documentation
3. **semver v7.x** — Programmatic version bumping (official npm library)

**What NOT to add:**
- `semantic-release` or similar — Kata already has working CI automation
- Diagram rendering engines (d3.js, vis.js) — Mermaid + Diagon cover all use cases
- `@octokit/rest` — `gh` CLI already provides GitHub API access
- Changelog generators — CHANGELOG.md is manually curated for quality

**Confidence: HIGH** — All technologies validated with official sources. No experimental dependencies.

**Integration points:**
- `scripts/bump-version.js` — Uses semver for automated version bumping
- `scripts/generate-workflow-docs.js` — Uses Mermaid for diagram generation
- `hooks/statusline.sh` — Bash script parsing `.planning/STATE.md` (no deps)

### From FEATURES.md: Table Stakes vs Differentiators

**Table stakes (users expect these):**
- Semantic versioning with MAJOR.MINOR.PATCH ✓ (already implemented)
- Git tag creation ✓ (CI handles via `gh release create`)
- GitHub Release creation ✓ (already implemented in `plugin-release.yml`)
- Publish trigger (merge to main → auto-publish) ✓ (already working)
- Changelog generation — **MISSING** (currently manual CHANGELOG.md)
- Version bump automation — **MISSING** (currently manual `.claude-plugin/plugin.json` edit)

**Differentiators (Kata-specific value):**
- Milestone-triggered release — Close milestone → prompt "Ready to release?"
- Phase completion validation — Verify all tasks done before allowing release
- Workflow diagrams (Mermaid) — Visual orchestrator → subagent flows
- ASCII workflow diagrams — Terminal-friendly visualization for `/kata:help`
- Statusline project info — Show current phase/milestone/task count
- Release notes from SUMMARY.md — Extract from phase accomplishments, not just commits

**Anti-features (explicitly avoid):**
- Manual version selection (defeats semantic versioning automation)
- Changelog in commit body (bloats commits, duplicate effort)
- Monolithic workflow diagrams (overwhelming, unmaintainable)
- Auto-merge PRs (removes human oversight)
- Video tutorials (become outdated, not searchable)

**MVP recommendation for v1.3.0:**
- Changelog auto-generation
- Version bump automation
- Quickstart documentation
- Workflow diagrams for core flows (planning, execution, verification)
- Milestone completion trigger
- Statusline project info

**Defer to post-v1.3.0:**
- Interactive onboarding wizard (complex UX design)
- Release notes from SUMMARY.md (commit-based sufficient initially)
- Rollback support (edge case, handle manually)

### From ARCHITECTURE.md: Integration Strategy

**Recommended approach:** Extend, don't replace. Kata's architecture already supports this work through:
1. **New skills** orchestrating multi-step release flows
2. **New agents** handling specialized tasks (release state machine, diagram generation)
3. **Enhanced CI** with validation checkpoints and feedback loops
4. **Config flags** enabling/disabling features (`.planning/config.json`)

**Component integration:**
```
/kata:completing-milestones (modified)
  └─> kata-release-manager agent (new)
       ├─> Validates changelog/version alignment
       ├─> Creates GitHub Release via gh CLI
       └─> Updates STATE.md with release status

/kata:documenting-workflows (new)
  └─> kata-workflow-documenter agent (new)
       ├─> Parses SKILL.md XML structure
       ├─> Generates Mermaid diagrams
       └─> Writes to skills/*/diagrams/ directory
```

**Key architectural patterns:**
1. **Release state machine** — Agent tracks draft → ready → published → failed transitions
2. **Progressive diagram disclosure** — Diagrams in `skills/*/diagrams/` loaded on-demand
3. **Validation before automation** — Local checks before GitHub Release creation (prevent CI failures)

**Build order recommendation:**
- **Phase 1: Release automation foundation** (highest value, proven patterns)
- **Phase 2: Workflow documentation system** (parallel development, isolated from Phase 1)
- **Phase 3: Integration & polish** (connects pieces, handles edge cases)

**Phases 1 and 2 can proceed independently** — no blocking dependencies between them.

**Scalability considerations:**
- Release time: Manual (5 min) → Automated (1 min)
- Diagram generation: Parallelizable (wave-based like execution)
- CI duration: ~2 min currently, minimal increase expected

### From PITFALLS.md: Critical Risks

**Critical pitfalls (cause rewrites/production failures):**

1. **CI environment path assumptions** — Kata already experienced this (v1.0.3-1.0.8). Paths work locally, fail in CI. Prevention: Test actual plugin artifacts in CI before release.

2. **GitHub Actions release trigger deadlock** — Releases created by GitHub Actions don't trigger `on: release` workflows. Default `GITHUB_TOKEN` lacks permissions. Prevention: Use PAT with `workflow` scope.

3. **npm OIDC authentication misconceptions** — Setting `NODE_AUTH_TOKEN` to empty string breaks OIDC. Must be completely unset. (Not applicable to Kata's plugin marketplace but similar auth pitfalls may exist)

4. **Semantic versioning without validation** — Automated version bumps based on commit messages can produce wrong versions if commits misrepresent changes. Prevention: Manual changelog review gate before publish.

5. **Workflow diagrams diverge from implementation** — Documentation shows one flow, code implements another. Prevention: Co-locate diagrams with code, establish review cadence, add "Last validated" timestamps.

**Moderate pitfalls (cause delays/rework):**
- `.gitignore` vs `.npmignore` confusion (build artifacts excluded from package)
- Statusline performance anti-patterns (network requests blocking render)
- Onboarding assumes expert context (beginners get stuck)
- Version bump without changelog review (wrong/misleading generated content)
- Missing integration test coverage (unit tests pass, workflows break)

**Phase-specific warnings:**
- **Phase 0 (CI validation):** Pitfall 1 (path assumptions), Pitfall 10 (integration tests)
- **Phase 1 (Release workflow):** Pitfall 2 (trigger deadlock), Pitfall 4 (version validation)
- **Phase 2 (Workflow docs):** Pitfall 5 (diagram divergence)
- **Phase 3 (Statusline):** Pitfall 7 (performance <50ms budget)

**Kata-specific high risks:**
- **Path resolution in plugin distribution** — Historical precedent, must validate transformed artifacts
- **Multi-step release workflow** — Many automation points where silent failures can occur
- **Workflow diagram maintenance** — 14 skills, multiple agents, complex to keep synchronized

---

## Implications for Roadmap

### Suggested Phase Structure

Based on combined research, recommend **4 phases with 2 parallel tracks**:

**Phase 0: Foundation & CI Hardening**
- **Rationale:** Prevent repeating v1.0.x path issues. Must validate CI before adding automation.
- **Deliverable:** CI tests actual plugin artifacts, integration test suite
- **Features:** None visible to users (infrastructure only)
- **Pitfalls to avoid:** Pitfall 1 (path assumptions), Pitfall 10 (missing integration tests)
- **Dependencies:** None (blocks Phase 1)

**Phase 1: Release Automation** (depends on Phase 0)
- **Rationale:** Highest-value pain point (manual releases). Builds on proven GitHub Actions.
- **Deliverable:** `/kata:completing-milestones` triggers GitHub Release → CI publishes plugin
- **Features:** Changelog generation, version bump automation, milestone → release flow
- **Pitfalls to avoid:** Pitfall 2 (trigger deadlock), Pitfall 4 (version validation), Pitfall 9 (changelog review)
- **Dependencies:** Phase 0 complete
- **Research needs:** None (STACK.md provides clear guidance)

**Phase 2: Workflow Documentation** (parallel to Phase 1 after Phase 0)
- **Rationale:** Isolated from release automation, provides independent UX value.
- **Deliverable:** Mermaid + ASCII diagrams for core workflows
- **Features:** `/kata:documenting-workflows`, diagrams for planning/execution/verification flows
- **Pitfalls to avoid:** Pitfall 5 (diagram divergence), Pitfall 11 (hard-coded versions)
- **Dependencies:** Phase 0 complete (parallel with Phase 1)
- **Research needs:** None (ARCHITECTURE.md defines pattern)

**Phase 3: Integration & UX Polish** (depends on Phases 1 and 2)
- **Rationale:** Connects release automation + workflow docs, adds finishing touches.
- **Deliverable:** Statusline integration, quickstart docs, batch diagram generation
- **Features:** Statusline shows phase/milestone, "Try Kata in 5 minutes" guide
- **Pitfalls to avoid:** Pitfall 7 (statusline performance), Pitfall 8 (expert assumptions), Pitfall 12 (versioning communication)
- **Dependencies:** Phases 1 and 2 complete
- **Research needs:** User testing for onboarding (optional `/kata:researching-phases 3`)

### Research Flags

**Skip research (standard patterns):**
- Phase 0: CI testing is well-documented, straightforward
- Phase 1: STACK.md + ARCHITECTURE.md provide complete guidance
- Phase 2: Mermaid syntax well-documented, diagram generation clear

**Consider research (if complexity emerges):**
- Phase 3: Statusline performance optimization (if <50ms budget hard to meet)
- Phase 3: Onboarding UX patterns (if beginner testing reveals gaps)

**Current research is sufficient for all phases.** No additional `/kata:researching-phases` calls needed unless implementation uncovers unexpected complexity.

### Dependency Graph

```
Phase 0 (Foundation)
├─> Phase 1 (Release Automation)
│   └─> Phase 3 (Integration)
└─> Phase 2 (Workflow Docs)
    └─> Phase 3 (Integration)
```

**Critical path:** Phase 0 → Phase 1 → Phase 3 (release automation focus)
**Parallel track:** Phase 0 → Phase 2 → Phase 3 (documentation can develop independently)

### Task Distribution Estimates

Based on complexity assessments from research:

- **Phase 0:** 2-3 tasks (CI validation script, integration test harness, artifact verification)
- **Phase 1:** 4-6 tasks (semver script, changelog generator, release-manager agent, skill modification, validation gates)
- **Phase 2:** 4-5 tasks (workflow-documenter agent, Mermaid generation, ASCII generation, diagram integration, documentation updates)
- **Phase 3:** 3-4 tasks (statusline script, quickstart docs, batch processing, performance optimization)

**Total estimated: 13-18 tasks across 4 phases.**

---

## Confidence Assessment

| Area                     | Confidence | Rationale                                                   |
| ------------------------ | ---------- | ----------------------------------------------------------- |
| **Stack (technologies)** | HIGH       | All libraries validated with official sources, proven in production, active maintenance |
| **Features (scope)**     | HIGH       | MVP definition clear, table stakes identified, anti-features flagged |
| **Architecture**         | HIGH       | Extends proven patterns (v1.1.0 GitHub integration, v0.1.5 agent spawning), no experimental designs |
| **Pitfalls**             | HIGH       | Grounded in Kata's actual history (v1.0.x releases) + verified sources |
| **Phase structure**      | MEDIUM-HIGH | Clear rationale for each phase, but task estimates are preliminary (refine during planning) |

**Gaps identified:**
1. **Statusline implementation details** — Research covers patterns but not Claude Code-specific API. May need investigation during Phase 3.
2. **Plugin marketplace authentication** — PITFALLS.md covers npm OIDC but Kata uses different marketplace. Similar auth patterns likely exist.
3. **User testing for onboarding** — FEATURES.md recommends beginner testing but research doesn't include user data. Phase 3 may need feedback loop.

**None of these gaps block starting work.** They can be addressed during phase planning/execution.

---

## Sources Aggregated

### Official Documentation (HIGH confidence)
- [Mermaid.js Official Docs](https://mermaid.js.org/)
- [GitHub - mermaid-js/mermaid](https://github.com/mermaid-js/mermaid)
- [semver - npm](https://www.npmjs.com/package/semver)
- [GitHub - npm/node-semver](https://github.com/npm/node-semver)
- [GitHub Actions: Releasing and maintaining actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/releasing-and-maintaining-actions)
- [Claude Code - Status line configuration](https://code.claude.com/docs/en/statusline)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/en/about/)

### Community Best Practices (MEDIUM-HIGH confidence)
- [semantic-release/semantic-release](https://github.com/semantic-release/semantic-release)
- [conventional-changelog/conventional-changelog](https://github.com/conventional-changelog/conventional-changelog)
- [GitHub - ArthurSonzogni/Diagon](https://github.com/ArthurSonzogni/Diagon)
- [Include diagrams in your Markdown files with Mermaid](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/)
- [Automating Versioning with Semantic Release | Agoda Engineering](https://medium.com/agoda-engineering/automating-versioning-and-releases-using-semantic-release-6ed355ede742)
- [How To Automatically Generate A Helpful Changelog](https://mokkapps.de/blog/how-to-automatically-generate-a-helpful-changelog-from-your-git-commit-messages)

### Kata-Specific (HIGH confidence)
- Kata codebase: `.github/workflows/plugin-release.yml`, `skills/completing-milestones/SKILL.md`
- Kata history: v1.0.1-v1.0.8 release notes (path resolution issues)
- Kata architecture: `.planning/config.json`, `agents/kata-executor.md`

### Known Issues & Pitfalls (HIGH confidence)
- [GitHub Actions release automation trigger issues](https://github.com/orgs/community/discussions/25281)
- [The Pain That is Github Actions](https://www.feldera.com/blog/the-pain-that-is-github-actions)
- [npm Classic Tokens to OIDC Trusted Publishing troubleshooting](https://dev.to/zhangjintao/from-deprecated-npm-classic-tokens-to-oidc-trusted-publishing-a-cicd-troubleshooting-journey-4h8b)
- [GitHub Actions path resolution issues](https://github.com/actions/runner/issues/2185)

---

## Ready for Roadmap Creation

This synthesis provides everything needed for `/kata:planning-roadmap`:

- **Scope definition:** Clear MVP (changelog, version bump, diagrams, statusline) vs deferred features
- **Phase structure:** 4 phases with parallel development opportunities
- **Technology choices:** 3 dependencies, all validated and minimal
- **Risk mitigation:** Critical pitfalls mapped to phases, prevention strategies defined
- **Confidence levels:** HIGH overall, specific gaps identified (but non-blocking)

**Recommended next steps:**
1. Orchestrator proceeds to requirements definition
2. Roadmapper uses phase suggestions to structure ROADMAP.md
3. Planner can start Phase 0 immediately (no additional research needed)

**Total research completeness: 95%** — Remaining 5% will emerge during phase planning (normal and expected).
