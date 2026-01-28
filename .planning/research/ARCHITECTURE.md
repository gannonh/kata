# Architecture: Release Automation & Workflow Documentation

**Project:** Kata v1.3.0
**Researched:** 2026-01-28
**Confidence:** HIGH

## Executive Summary

Release automation and workflow documentation integrate with Kata's existing architecture through three primary mechanisms: **GitHub Actions integration** (already proven in v1.1.0), **documentation generation systems** (new component), and **skill-based orchestration** (existing pattern extended).

The architecture leverages Kata's strengths:
- Skills orchestrate multi-step workflows
- GitHub Actions handles CI/CD triggers
- Hooks provide event-driven automation
- Config-driven behavior enables/disables features

**Key architectural principle:** Kata remains a coordination layer, not a CI/CD platform. GitHub Actions does the heavy lifting; Kata provides the human-friendly interface.

## Recommended Architecture

### High-Level System Structure

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interaction Layer                    │
│  Skills: completing-milestones, creating-workflow-diagrams  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orchestration Layer (New)                   │
│  Skills: managing-releases, documenting-workflows            │
│  Agents: kata-release-manager, kata-workflow-documenter      │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  GitHub Actions  │ │  File System │ │  Config Layer    │
│  (Existing)      │ │  (Existing)  │ │  (Existing)      │
├──────────────────┤ ├──────────────┤ ├──────────────────┤
│ plugin-release   │ │ .planning/*  │ │ config.json      │
│ (triggers CI)    │ │ skills/*/    │ │ (feature flags)  │
│                  │ │ agents/      │ │                  │
└──────────────────┘ └──────────────┘ └──────────────────┘
</update>
```

### Component Integration Map

| Component Type | Existing | New | Modified | Purpose |
| -------------- | -------- | --- | -------- | ------- |
| **Skills** | completing-milestones | managing-releases | completing-milestones | Release orchestration |
| **Skills** | - | documenting-workflows | - | Diagram generation |
| **Agents** | - | kata-release-manager | - | Release state machine |
| **Agents** | - | kata-workflow-documenter | - | Diagram generation |
| **GitHub Actions** | plugin-release.yml | - | plugin-release.yml | Enhanced automation |
| **Templates** | milestone-archive.md | release-template.md | - | Release artifacts |
| **Config** | config.json | - | config.json | Release flags |
| **Hooks** | hooks.json | - | hooks.json (optional) | Post-release events |

## Integration Points with Existing Architecture

### 1. Skills Layer (Orchestrators)

**Existing Pattern:** Skills spawn sub-agents via Task tool, stay lean (~15% context)

**Integration:**
```
/kata:complete-milestone
  └─> kata-release-manager agent (new)
       ├─> Validates changelog
       ├─> Triggers GitHub Actions (existing workflow)
       └─> Updates STATE.md (existing)

/kata:document-workflow [skill-name]
  └─> kata-workflow-documenter agent (new)
       ├─> Reads SKILL.md (existing)
       ├─> Generates Mermaid diagram
       └─> Writes to skill/references/ (existing pattern)
```

**New Skills Required:**
- `kata-managing-releases` — Orchestrates milestone → release → publish
- `kata-documenting-workflows` — Generates diagrams from skills/agents

**Modified Skills:**
- `kata-completing-milestones` — Add release automation step after archiving
- `kata-adding-milestones` — Include workflow diagram TODOs in checklist

### 2. Agent Layer (Execution)

**Existing Pattern:** Agents get fresh 200k context, specialized responsibilities

**Integration:**
```
kata-release-manager.md (new)
├─> Role: State machine for release process
├─> Capabilities: ["validate_release", "trigger_ci", "update_state"]
├─> Tools: Read, Write, Bash(gh:*)
└─> Spawned by: kata-managing-releases skill

kata-workflow-documenter.md (new)
├─> Role: Extract workflow logic → Mermaid/ASCII
├─> Capabilities: ["parse_skill", "generate_mermaid", "generate_ascii"]
├─> Tools: Read, Write
└─> Spawned by: kata-documenting-workflows skill
```

**Design Rationale:**
- **kata-release-manager** handles multi-step state (draft → ready → published)
- **kata-workflow-documenter** isolates diagram generation complexity from main flow
- Both follow existing agent pattern: specialized, single-responsibility

### 3. GitHub Actions Integration (Existing)

**Current State:** `.github/workflows/plugin-release.yml` already implements:
- Version checking (local vs marketplace)
- Test execution
- Build validation
- Marketplace publishing
- GitHub Release creation

**Enhancement Points:**
```yaml
# plugin-release.yml (modified)
on:
  push:
    branches: [main]
  release:
    types: [published]  # NEW: explicit release trigger

jobs:
  publish-plugin:
    # ... existing steps ...

    - name: Validate Kata state (NEW)
      run: |
        # Check .planning/STATE.md indicates milestone complete
        # Verify CHANGELOG.md matches package.json version
        node scripts/validate-release-state.js

    - name: Generate release notes (NEW)
      run: |
        # Extract from CHANGELOG.md or milestone archive
        node scripts/extract-release-notes.js
```

**Integration Strategy:**
- **Trigger:** Kata creates GitHub Release via `gh release create`
- **Validation:** CI checks Kata planning state before publishing
- **Feedback:** CI status visible in Kata skill output

### 4. Configuration Layer (Feature Flags)

**Existing Pattern:** `.planning/config.json` with boolean flags

**Integration:**
```json
{
  "mode": "yolo",
  "pr_workflow": true,
  "github": {
    "enabled": true,
    "issueMode": "auto"
  },
  "release": {  // NEW section
    "automated": true,
    "preReleaseValidation": true,
    "changelogFormat": "standard",
    "notifyOnPublish": false
  },
  "documentation": {  // NEW section
    "generateWorkflowDiagrams": true,
    "diagramFormat": "mermaid",  // "mermaid" | "ascii" | "both"
    "includeDecisionTrees": true
  }
}
```

**Flag Behavior:**
- `release.automated: false` → Manual GitHub Release only
- `documentation.generateWorkflowDiagrams: false` → Skip diagram generation

### 5. File System Layer (Conventions)

**Existing Structure:**
```
.planning/
├── ROADMAP.md
├── STATE.md
├── PROJECT.md
├── config.json
└── milestones/
    └── v1.1.0-ROADMAP.md

skills/kata-executing-phases/
├── SKILL.md
└── references/
    └── phase-execute.md
```

**Enhanced Structure:**
```
.planning/
├── ROADMAP.md
├── STATE.md
├── PROJECT.md
├── config.json
├── milestones/
│   └── v1.1.0-ROADMAP.md
└── releases/  # NEW: release artifacts
    └── v1.1.0/
        ├── RELEASE-NOTES.md
        └── validation.json

skills/kata-executing-phases/
├── SKILL.md
├── references/
│   └── phase-execute.md
└── diagrams/  # NEW: workflow diagrams
    ├── workflow.mmd (Mermaid)
    └── workflow.ascii.txt
```

**Rationale:**
- **`.planning/releases/`** — Historical release metadata (parallel to milestones/)
- **`skills/*/diagrams/`** — Progressive disclosure (load on demand)
- Follows existing convention of skill-local references

### 6. Hook Integration (Optional)

**Existing Pattern:** `hooks/hooks.json` for event-driven automation

**Potential Integration:**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/update-workflow-diagrams.js"
          }
        ]
      }
    ]
  }
}
```

**Use Cases:**
- Auto-regenerate diagrams when SKILL.md changes
- Notify on GitHub Release creation
- Update statusline with release version

**Recommendation:** NOT MVP. Hooks add complexity; start with explicit skill invocation.

## Data Flow Patterns

### Release Automation Flow

```
User: /kata:complete-milestone
  │
  ├──> completing-milestones skill
  │     ├─> Validates artifacts (CHANGELOG, package.json)
  │     ├─> Archives milestone (existing)
  │     └─> Spawns kata-release-manager agent
  │
  ├──> kata-release-manager agent
  │     ├─> Creates GitHub Release (gh release create)
  │     ├─> Saves release metadata (.planning/releases/)
  │     └─> Updates STATE.md
  │
  └──> GitHub Actions (triggered by release)
        ├─> Validates state
        ├─> Runs tests
        ├─> Builds plugin
        ├─> Publishes to marketplace
        └─> Notifies user (via gh CLI)
```

**Key Decision Points:**
1. **Pre-flight check** — CHANGELOG/package.json validated before GitHub Release
2. **CI trigger** — `release.published` event starts automation
3. **State update** — STATE.md reflects "published" status after success

### Workflow Documentation Flow

```
User: /kata:document-workflow kata-executing-phases
  │
  ├──> documenting-workflows skill
  │     ├─> Reads skill SKILL.md + references/
  │     ├─> Extracts process steps, decision points
  │     └─> Spawns kata-workflow-documenter agent
  │
  ├──> kata-workflow-documenter agent
  │     ├─> Parses <process>, <step>, <if> tags
  │     ├─> Generates Mermaid syntax
  │     ├─> Generates ASCII fallback
  │     └─> Writes to skills/*/diagrams/
  │
  └──> User reviews generated diagrams
        └─> Commits if accurate (or regenerates)
```

**Key Decision Points:**
1. **Format selection** — config.json determines Mermaid/ASCII/both
2. **Validation** — Agent shows preview before writing
3. **Location** — Diagrams stored with skill for co-location

## Scalability Considerations

| Concern | At Current State | At 50 Skills | At 100 Skills |
| ------- | ---------------- | ------------ | ------------- |
| **Release time** | Manual (5 min) | Automated (1 min) | Automated (1 min) |
| **Diagram generation** | On-demand | Batch mode (all skills) | Batch + caching |
| **CI duration** | ~2 min | ~2 min (parallelized) | ~3 min (test scaling) |
| **Storage** | .planning/releases/ | Same (markdown only) | Archive old releases |

**Bottlenecks:**
- **Diagram generation** — 27 skills × 30s each = 13.5 min if sequential
  - **Mitigation:** Spawn parallel kata-workflow-documenter agents (wave-based like execution)
- **GitHub Release creation** — Single serial operation (acceptable)
- **CI test suite** — Already parallelized, scales with test count not skill count

## Architecture Patterns

### Pattern 1: Release State Machine

**Problem:** Release has multiple stages (draft → ready → published → failed)

**Solution:** Agent-based state machine with explicit transitions
```
┌─────────┐  validate  ┌───────┐  publish  ┌───────────┐
│  DRAFT  ├───────────>│ READY ├─────────>│ PUBLISHED │
└────┬────┘            └───┬───┘           └───────────┘
     │                     │
     │ validation fails    │ CI fails
     ▼                     ▼
┌─────────────────────────────┐
│         BLOCKED             │
└─────────────────────────────┘
```

**Implementation:**
- `kata-release-manager` agent maintains state in `.planning/releases/vX.Y.Z/state.json`
- Each transition validated before proceeding
- CI failure triggers automatic state update (via hook or polling)

### Pattern 2: Progressive Diagram Disclosure

**Problem:** Not all users need diagrams; they add cognitive load

**Solution:** Generate on-demand, store with skill
```
skills/kata-executing-phases/
├── SKILL.md (400 lines)
└── diagrams/
    ├── workflow.mmd (150 lines) ← Load when needed
    └── workflow.ascii.txt (80 lines)
```

**Benefit:**
- Main skill stays under 500 line target
- Diagrams referenced via `[workflow diagram](diagrams/workflow.mmd)` link
- Agent loads diagrams only if user asks "show me the workflow"

### Pattern 3: Validation Before Automation

**Problem:** CI failures waste time and resources

**Solution:** Local validation before GitHub Release creation
```
completing-milestones skill
  ├─> Check CHANGELOG.md exists
  ├─> Verify package.json version matches
  ├─> Run npm test locally
  ├─> Validate git tree clean
  └─> THEN create GitHub Release
```

**Catches 80% of issues before CI runs.**

## Anti-Patterns to Avoid

### Anti-Pattern 1: Embedding CI Logic in Skills

**DON'T:**
```xml
<task type="auto">
  <name>Build and publish plugin</name>
  <action>
    Run full test suite
    Build plugin distribution
    Validate build output
    Publish to marketplace
    Create GitHub Release
  </action>
</task>
```

**DO:**
```xml
<task type="auto">
  <name>Trigger release automation</name>
  <action>
    Create GitHub Release with tag vX.Y.Z.
    CI will handle: tests, build, publish.
    Track status via: gh run watch
  </action>
</task>
```

**Rationale:** Kata coordinates, GitHub Actions executes. Separation of concerns.

### Anti-Pattern 2: Monolithic Diagram Generation

**DON'T:**
```
/kata:generate-all-diagrams
  └─> Single agent processes all 27 skills serially
```

**DO:**
```
/kata:document-workflow [skill-name]  # On-demand per skill
OR
/kata:batch-document-workflows        # Parallel wave execution
  └─> Spawn kata-workflow-documenter × 5 in parallel
```

**Rationale:** Follows existing wave-based parallelization pattern from kata-executing-phases.

### Anti-Pattern 3: Stateful Skills

**DON'T:**
```
skill maintains release state across invocations
relies on environment variables persisting
```

**DO:**
```
skill reads STATE.md for current position
agent writes state to .planning/releases/vX.Y.Z/
fresh context on each invocation
```

**Rationale:** Skills are stateless orchestrators; state lives in `.planning/`.

## Build Order Recommendations

### Phase 1: Release Automation Foundation
**Goal:** Automate the critical path (milestone → release → publish)

**Components:**
1. `kata-release-manager` agent
2. Modify `kata-completing-milestones` skill
3. Enhance `plugin-release.yml` workflow
4. Add `.planning/releases/` structure
5. Config flags: `release.automated`

**Rationale:** Addresses highest-value pain point (manual releases). Builds on proven GitHub Actions integration.

**Estimated Complexity:** MEDIUM (extends existing patterns)

### Phase 2: Workflow Documentation System
**Goal:** Generate diagrams for existing skills

**Components:**
1. `kata-workflow-documenter` agent
2. `kata-documenting-workflows` skill
3. Mermaid generation logic
4. ASCII fallback generation
5. Config flags: `documentation.*`

**Rationale:** Isolated from release automation; can develop in parallel. Provides UX value independent of releases.

**Estimated Complexity:** MEDIUM-HIGH (new logic, diagram parsing)

### Phase 3: Integration & Polish
**Goal:** Connect the pieces, handle edge cases

**Components:**
1. Batch diagram generation
2. Wave-based parallelization
3. Hooks for auto-regeneration (optional)
4. Statusline integration
5. Error recovery flows

**Rationale:** Refinement after core features proven. Leverages learnings from Phases 1-2.

**Estimated Complexity:** LOW-MEDIUM (mostly polish)

### Dependencies Between Phases

```
Phase 1 (Release Automation)
  │
  │ No blocking dependencies
  │
  └──> Phase 3 (Integration)

Phase 2 (Workflow Docs)
  │
  │ No blocking dependencies
  │
  └──> Phase 3 (Integration)
```

**Key Insight:** Phases 1 and 2 are **parallelizable**. Both extend existing architecture independently.

## Technical Debt & Risks

### Risk 1: GitHub API Rate Limits
**Likelihood:** LOW
**Impact:** MEDIUM

**Mitigation:**
- Use `gh` CLI (authenticated, higher limits)
- Cache release state locally
- Fail gracefully with retry instructions

### Risk 2: Diagram Generation Accuracy
**Likelihood:** MEDIUM
**Impact:** LOW

**Mitigation:**
- Start with simple Mermaid flowcharts
- Human-in-the-loop validation before commit
- Iterative refinement based on user feedback

### Risk 3: CI Failure Handling
**Likelihood:** MEDIUM
**Impact:** HIGH

**Mitigation:**
- Local validation before GitHub Release (Pattern 3)
- Clear error messages with recovery steps
- State machine tracks "BLOCKED" status

### Technical Debt Introduced

1. **Diagram parsing logic** — New complexity in workflow-documenter agent
   - **Payoff:** Reusable across all skills/agents
   - **Cleanup:** Extract to shared library if >3 use cases

2. **Release state management** — New `.planning/releases/` structure
   - **Payoff:** Historical audit trail
   - **Cleanup:** Archive releases older than 6 months

3. **Config proliferation** — New `release.*` and `documentation.*` flags
   - **Payoff:** Granular control
   - **Cleanup:** Consolidate if flags always used together

## References

### Official Documentation (HIGH confidence)
- [GitHub Actions: Releasing and maintaining actions](https://docs.github.com/en/actions/sharing-automations/creating-actions/releasing-and-maintaining-actions) — Official patterns
- [Mermaid Flowcharts Syntax](https://mermaid.ai/open-source/syntax/flowchart.html) — Diagram syntax reference
- [semantic-release documentation](https://semantic-release.gitbook.io/) — Automated versioning

### Community Practices (MEDIUM confidence)
- [Setting up Automated Release Workflow with GitHub Actions](https://birtony.medium.com/setting-up-automated-release-workflow-with-github-actions-628dbca2446e) — Practical examples
- [Include diagrams in your Markdown files with Mermaid](https://github.blog/developer-skills/github/include-diagrams-markdown-files-mermaid/) — GitHub integration
- [Using semantic-release to automate releases and changelogs](https://blog.logrocket.com/using-semantic-release-automate-releases-changelogs/) — Best practices

### Kata-Specific (HIGH confidence)
- Existing: `.github/workflows/plugin-release.yml`
- Existing: `skills/completing-milestones/SKILL.md`
- Existing: `agents/kata-executor.md` (pattern reference)
- Existing: `.planning/config.json` (feature flag pattern)

## Summary

**Integration Strategy:** Extend, don't replace. Kata's existing architecture supports release automation and workflow documentation through:
1. **New skills** orchestrating multi-step flows
2. **New agents** handling specialized tasks (release state, diagram generation)
3. **Enhanced CI** with validation and feedback loops
4. **Config flags** enabling/disabling features

**Confidence Level:** HIGH
- GitHub Actions integration proven (v1.1.0)
- Agent spawning pattern proven (v0.1.5)
- Config-driven behavior proven (v1.1.0)
- New components follow established patterns

**Critical Success Factors:**
1. Keep skills thin (orchestration only)
2. Leverage existing GitHub Actions (don't reinvent CI)
3. Validate before automation (fail fast locally)
4. Progressive disclosure (diagrams on-demand)

**Recommended Build Order:**
1. Phase 1: Release automation (highest value)
2. Phase 2: Workflow documentation (parallel development)
3. Phase 3: Integration & polish

Both Phase 1 and Phase 2 can proceed independently, then merge in Phase 3.
