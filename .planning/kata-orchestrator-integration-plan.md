# Kata Orchestrator Integration Plan

## Executive Summary

**Objective:** Integrate Kata Orchestrator's spec-driven, multi-agent development workflows into Kata Agents as a native development process capability.

**Approach:** Hybrid integration - port orchestrator skills to workspace skills while adding native UI support for orchestration artifacts and state management.

**Timeline:** Phased rollout over 3 milestones
- **Phase 1 (v0.5.0):** Core Skills Migration (2-3 weeks)
- **Phase 2 (v0.6.0):** Native UI Integration (3-4 weeks)
- **Phase 3 (v0.7.0):** Advanced Features (2-3 weeks)

---

## Background

### What is Kata Orchestrator?

Kata Orchestrator is a **spec-driven development framework** for Claude Code. It provides:

1. **Structured Development Lifecycle**
   - Project initialization → Milestones → Phases → Planning → Execution → Verification
   - Research-driven planning with requirement traceability
   - Multi-agent orchestration with specialized sub-agents

2. **26+ Workflow Skills**
   - `starting-projects` - Project setup with deep questioning
   - `adding-milestones` - Milestone creation with research
   - `planning-phases` - Creates executable PLAN.md files
   - `executing-phases` - Wave-based parallel execution
   - `verifying-work` - UAT testing with debug agents
   - `reviewing-pull-requests` - 6 specialized review agents
   - `completing-milestones` - Archive + release workflow
   - Plus: debugging, codebase mapping, todo management, phase operations

3. **19 Specialized Agents**
   - Planning: `kata-planner`, `kata-plan-checker`
   - Execution: `kata-executor`
   - Verification: `kata-verifier`, `kata-debugger`
   - Research: `kata-phase-researcher`, `kata-project-researcher`
   - Review: `kata-code-reviewer`, `kata-test-analyzer`, `kata-type-analyzer`, etc.
   - Mapping: `kata-codebase-mapper`

4. **Artifact Structure** (`.planning/` directory)
   ```
   .planning/
   ├── PROJECT.md           # Vision, requirements, decisions
   ├── ROADMAP.md           # Phase structure
   ├── REQUIREMENTS.md      # Scoped requirements with IDs
   ├── STATE.md             # Living memory
   ├── config.json          # Workflow configuration
   ├── phases/
   │   └── 01-foundation/
   │       ├── 01-RESEARCH.md
   │       ├── 01-01-PLAN.md
   │       ├── 01-01-SUMMARY.md
   │       └── 01-VERIFICATION.md
   └── milestones/          # Archived work
   ```

5. **Key Architecture Principles**
   - **Plans ARE prompts** - PLAN.md files are executable XML documents
   - **Thin orchestrators** - Skills stay lean (~15% context)
   - **Fresh agent context** - Each sub-agent gets full 200k tokens
   - **Natural language first** - "plan phase 2" or `/kata:planning-phases 2`
   - **Optional GitHub integration** - Milestones → Issues → PRs → Releases

### Why Integrate into Kata Agents?

Kata Agents is positioned as the **native desktop interface for the Kata ecosystem**. Currently:

- ✅ **Has:** Multi-workspace support, skill system, MCP integration, OAuth, session management
- ❌ **Missing:** Structured development workflows, project lifecycle management, multi-agent orchestration

**Value proposition:**
- Bring powerful spec-driven workflows to desktop users
- Visual interface for planning artifacts (.planning/ files)
- Workspace-scoped orchestration state
- Native GitHub integration hooks
- Desktop-first features (notifications, file watchers, visual editors)

---

## Integration Options Analysis

### Option 1: Pure Skills Approach ⭐ (Recommended Starting Point)

**Description:** Port all orchestrator skills to Kata Agents workspace skills.

**Architecture:**
```
~/.kata-agents/workspaces/{workspace-id}/
├── skills/
│   ├── starting-projects/SKILL.md
│   ├── adding-milestones/SKILL.md
│   ├── planning-phases/SKILL.md
│   ├── executing-phases/SKILL.md
│   └── ... (26 skills)
└── (project working directories)
```

**Pros:**
- ✅ Leverages existing skill system (zero arch changes)
- ✅ Workspace-scoped (each workspace can customize)
- ✅ Skills already use identical SKILL.md format
- ✅ Fast to implement (mostly porting)
- ✅ Users familiar with Claude Code can immediately use
- ✅ Skills can be versioned/updated independently

**Cons:**
- ❌ No native UI for artifacts initially
- ❌ Each workspace needs skills (can be solved with "skill packs")
- ❌ No app-level orchestration state

**Compatibility:**
- Skills use `Task` tool to spawn agents → Already supported ✅
- Skills use `Read`/`Write`/`Edit` → Already supported ✅
- Skills use `Bash` for git/gh → Already supported ✅
- Skills use `TodoWrite` → Already supported ✅
- Skills reference agents via markdown files → Works as-is ✅

### Option 2: Native Development Process

**Description:** Build orchestration deeply into Kata Agents as first-class features.

**Architecture:**
```
Kata Agents App
├── Planning Panel (new UI)
├── Orchestration Manager (new service)
├── Artifact Viewer (new component)
├── GitHub Integration (enhanced)
└── Multi-agent Dispatcher (new service)
```

**Pros:**
- ✅ First-class UI integration
- ✅ App-level orchestration features
- ✅ Visual artifact editing
- ✅ Shared orchestration state across workspaces

**Cons:**
- ❌ Major architecture changes
- ❌ Tightly couples orchestrator to Kata Agents
- ❌ Harder to maintain (two codebases merge)
- ❌ Longer development timeline (6-12 months)
- ❌ Breaks modularity

### Option 3: Hybrid Approach ⭐⭐ (Recommended Long-term)

**Description:** Skills for workflows + native UI for artifacts and state.

**Phase 1:** Port skills (pure skills approach)
**Phase 2:** Add native UI components for orchestration
**Phase 3:** Build app-level orchestration features

**Architecture:**
```
Kata Agents
├── Skills (orchestration workflows)
│   └── Invoked via /workspace:skill-name
├── Native UI (artifact viewers/editors)
│   ├── Planning Panel - view .planning/ structure
│   ├── Roadmap Viewer - visual roadmap editor
│   ├── Plan Viewer - render PLAN.md with XML syntax
│   └── GitHub Status - PR/issue tracking
├── Services (orchestration support)
│   ├── Artifact Watcher - detect .planning/ changes
│   ├── State Persistence - workspace orchestration state
│   └── GitHub Sync - mirror roadmap ↔ GitHub
└── Workspace Extensions (skill packs)
    └── "kata-dev" pack - all orchestrator skills
```

**Pros:**
- ✅ Incremental rollout (ship value early)
- ✅ Modular (skills separate from UI)
- ✅ Best of both worlds (flexibility + polish)
- ✅ Native features add value over time
- ✅ Maintains skill portability

**Cons:**
- ⚠️ More complex long-term architecture
- ⚠️ Requires coordination between skills and native features

---

## Recommended Approach: Hybrid (3-Phase Plan)

### Phase 1: Core Skills Migration (v0.5.0)

**Goal:** Port essential orchestrator skills to Kata Agents, enabling spec-driven workflows.

**Deliverables:**

1. **Skill Pack System**
   - Create "kata-dev" skill pack (bundle of related skills)
   - Install script: copies all orchestrator skills to workspace
   - User command: `/install-pack kata-dev`

2. **Core Skills** (Priority 1 - Essential Workflow)
   - ✅ `starting-projects` - Initialize PROJECT.md + config
   - ✅ `adding-milestones` - Milestone + requirements + roadmap
   - ✅ `planning-phases` - Research → Plan → Verify
   - ✅ `executing-phases` - Wave execution with agents
   - ✅ `verifying-work` - UAT + debug agents
   - ✅ `tracking-progress` - Status reporting
   - ✅ `completing-milestones` - Archive + release

3. **Agent Files**
   - Port all 19 agent markdown files to workspace
   - Store at: `~/.kata-agents/workspaces/{id}/.kata/agents/`
   - Skills reference agents via relative paths

4. **Templates**
   - Port templates (PROJECT.md, PLAN.md, etc.)
   - Store at: `~/.kata-agents/workspaces/{id}/.kata/templates/`

5. **Documentation**
   - Add orchestration guide to `~/.kata-agents/docs/orchestration.md`
   - Update skills.md with orchestrator skill examples
   - Create quickstart guide

**Effort:** 2-3 weeks

**Success Criteria:**
- ✅ Users can run full project lifecycle in Kata Agents
- ✅ Skills invoke agents correctly via Task tool
- ✅ Artifacts (.planning/) generated correctly
- ✅ Natural language + slash commands work
- ✅ GitHub integration works (if enabled in config)

### Phase 2: Native UI Integration (v0.6.0)

**Goal:** Add visual interfaces for orchestration artifacts and state.

**Deliverables:**

1. **Planning Panel** (Sidebar)
   - Shows `.planning/` directory structure
   - Visual indicators: phases (planned/in-progress/complete)
   - Click to open artifact files
   - Quick actions: "Plan Next Phase", "Execute Phase"

2. **Roadmap Viewer**
   - Visual roadmap (Gantt-style or Kanban)
   - Drag-drop phase reordering
   - Phase status badges
   - Requirement traceability view

3. **Plan Viewer** (Enhanced Markdown)
   - Syntax highlighting for XML in PLAN.md
   - Task checkboxes (mark complete)
   - Wave visualization
   - "Execute This Plan" button

4. **Artifact Watcher**
   - Monitor `.planning/` directory for changes
   - Update UI in real-time
   - Trigger notifications on milestone completion

5. **GitHub Status Integration**
   - Show linked GitHub issue/PR in planning panel
   - Visual sync status (local ↔ remote)
   - Quick PR review trigger

6. **Session Context Awareness**
   - Detect `.planning/` in working directory
   - Auto-enable orchestration UI
   - Context-aware suggestions ("Next: Plan phase 2")

**Effort:** 3-4 weeks

**Success Criteria:**
- ✅ Users see visual roadmap in UI
- ✅ Artifact files rendered beautifully
- ✅ Real-time updates when skills modify .planning/
- ✅ GitHub integration visible in UI

### Phase 3: Advanced Features (v0.7.0)

**Goal:** Add app-level orchestration features that leverage desktop capabilities.

**Deliverables:**

1. **Multi-Project Dashboard**
   - See all projects with orchestration enabled
   - Cross-project metrics (phases planned/executed)
   - Project health indicators

2. **Visual Plan Editor**
   - WYSIWYG editor for PLAN.md files
   - Task dependency graph builder
   - Wave assignment UI

3. **Orchestration Templates**
   - Pre-built project templates (web app, CLI tool, library, etc.)
   - Community template marketplace
   - Import/export templates

4. **Smart Notifications**
   - Desktop notifications on agent completion
   - Phase milestone notifications
   - GitHub PR status updates

5. **Orchestration Analytics**
   - Time tracking per phase
   - Velocity metrics (phases/week)
   - Agent efficiency stats
   - Cost tracking (API usage)

6. **Team Collaboration Features**
   - Shared orchestration state (via GitHub sync)
   - Comments on plans/phases
   - Assignment of phases to team members

7. **Enhanced GitHub Integration**
   - Two-way sync (GitHub → local changes)
   - Project board integration
   - Release automation (changelog generation)

8. **Workspace Skill Packs**
   - Discover and install skill packs from registry
   - Kata-dev, kata-ui, kata-backend, kata-mobile packs
   - Custom team packs

**Effort:** 2-3 weeks

**Success Criteria:**
- ✅ Desktop app provides unique value over CLI
- ✅ Visual tools accelerate workflow
- ✅ Team collaboration features work
- ✅ Analytics provide actionable insights

---

## Technical Implementation Details

### 1. Skill Porting Process

**Compatibility Matrix:**

| Feature | Kata Orchestrator | Kata Agents | Changes Needed |
|---------|------------------|-------------|----------------|
| SKILL.md format | ✅ | ✅ | None - identical |
| Task tool | ✅ (spawns agents) | ✅ | None |
| Agent markdown files | `.claude/agents/` | `~/.kata-agents/workspaces/{id}/.kata/agents/` | Update paths |
| Bash commands | ✅ (git, gh) | ✅ | None |
| Read/Write/Edit | ✅ | ✅ | None |
| TodoWrite | ✅ | ✅ | None |
| SubmitPlan | ✅ | ✅ | None |
| Workspace qualifier | `/kata:skill` | `/workspace-id:skill` | Update invocation format |

**Migration Steps:**

1. **Copy skills to workspace**
   ```bash
   cp -r kata-orchestrator/skills/* \
     ~/.kata-agents/workspaces/{id}/skills/
   ```

2. **Update agent references**
   - Change: `@agents/kata-planner.md`
   - To: `@~/.kata-agents/workspaces/{id}/.kata/agents/kata-planner.md`

3. **Update skill invocation**
   - Skills reference each other via Task tool
   - Change: `/kata:planning-phases`
   - To: `/{workspace-id}:planning-phases` (qualified format)

4. **Port templates**
   ```bash
   cp -r kata-orchestrator/kata/templates/* \
     ~/.kata-agents/workspaces/{id}/.kata/templates/
   ```

5. **Test agent spawning**
   - Ensure Task tool correctly loads agent markdown files
   - Verify fresh context per agent (200k tokens)
   - Check model profile resolution (opus/sonnet/haiku)

### 2. Workspace Skill Pack System

**Architecture:**

```typescript
// Skill Pack Manifest
interface SkillPack {
  id: string;                      // "kata-dev"
  name: string;                    // "Kata Development"
  description: string;
  version: string;                 // "1.3.0"
  skills: SkillReference[];        // List of skills
  agents: AgentReference[];        // List of agents
  templates: TemplateReference[];  // List of templates
  dependencies?: SkillPack[];      // Other packs required
}

// Installation
class SkillPackManager {
  async installPack(packId: string, workspaceId: string): Promise<void> {
    // 1. Download pack manifest
    // 2. Copy skills to workspace
    // 3. Copy agents to workspace
    // 4. Copy templates to workspace
    // 5. Update workspace config
    // 6. Notify user
  }

  async updatePack(packId: string, workspaceId: string): Promise<void> {
    // Check for updates, prompt user, update files
  }
}
```

**User Experience:**

```
User: "Install kata development skills"
Assistant: [Invokes installSkillPack MCP tool]
System: Installing kata-dev pack v1.3.0...
        - 26 skills
        - 19 agents
        - 8 templates
        ✅ Installed to workspace: my-project

User: "Start a new project"
Assistant: [Invokes /my-project:starting-projects skill]
```

### 3. Native UI Components

**Planning Panel Component:**

```typescript
// packages/ui/src/components/orchestration/PlanningPanel.tsx
interface PlanningPanelProps {
  workingDirectory: string;
  planningPath: string;  // .planning/ directory
}

export const PlanningPanel: React.FC<PlanningPanelProps> = ({
  workingDirectory,
  planningPath
}) => {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);

  // Watch .planning/ directory for changes
  useEffect(() => {
    const watcher = watchDirectory(planningPath, (changes) => {
      // Reload roadmap/phases on file changes
    });
    return () => watcher.close();
  }, [planningPath]);

  return (
    <div className="planning-panel">
      <RoadmapViewer roadmap={roadmap} />
      <PhaseList phases={phases} onExecute={handleExecutePhase} />
      <QuickActions />
    </div>
  );
};
```

**Artifact Watcher Service:**

```typescript
// packages/shared/src/orchestration/watcher.ts
import chokidar from 'chokidar';

export class ArtifactWatcher {
  private watcher: chokidar.FSWatcher;

  watchPlanning(planningPath: string, callback: (artifact: Artifact) => void) {
    this.watcher = chokidar.watch(planningPath, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true
    });

    this.watcher
      .on('add', path => this.handleFileChange('add', path, callback))
      .on('change', path => this.handleFileChange('change', path, callback));
  }

  private handleFileChange(
    event: 'add' | 'change',
    filePath: string,
    callback: (artifact: Artifact) => void
  ) {
    // Parse artifact type from filename
    // Emit event to UI
    // Trigger notifications if needed
  }
}
```

### 4. Agent Integration

**Current State:**
- Kata Orchestrator agents are markdown files with YAML frontmatter
- Skills spawn agents via Task tool
- Agents load full context (PROJECT.md, ROADMAP.md, relevant phase files)

**Integration:**
- Store agents at: `~/.kata-agents/workspaces/{id}/.kata/agents/`
- Skills reference agents via workspace-relative paths
- Task tool already supports loading markdown agents
- No changes needed to agent format

**Example Agent Reference in Skill:**

```markdown
<!-- In planning-phases/SKILL.md -->

Spawn planner agent:

```bash
Task tool with:
  subagent_type: "general-purpose"
  prompt: "@~/.kata-agents/workspaces/{id}/.kata/agents/kata-planner.md

          @.planning/PROJECT.md
          @.planning/ROADMAP.md
          @.planning/phases/{phase}/*-CONTEXT.md

          Create PLAN.md files for phase {phase}."
```
```

### 5. Configuration

**Workspace Orchestration Config:**

```jsonc
// ~/.kata-agents/workspaces/{id}/config.json
{
  "orchestration": {
    "enabled": true,
    "skillPack": "kata-dev@1.3.0",
    "mode": "interactive",  // "yolo" | "interactive"
    "depth": "standard",    // "quick" | "standard" | "comprehensive"
    "model_profile": "balanced",  // "quality" | "balanced" | "budget"
    "workflow": {
      "research": true,     // Research before planning
      "plan_check": true,   // Verify plans
      "verifier": true      // Post-execution verification
    },
    "github": {
      "enabled": false,     // GitHub integration
      "issueMode": "auto",  // "auto" | "ask" | "never"
      "repo": "owner/repo"  // Auto-detected from git remote
    },
    "pr_workflow": false,   // Branch + PR per phase
    "commit_docs": true,    // Track .planning/ in git
    "parallelization": true // Parallel plan execution
  }
}
```

**App-Level Settings:**

```jsonc
// ~/.kata-agents/config.json
{
  "orchestration": {
    "defaultSkillPack": "kata-dev",
    "autoDetectProjects": true,  // Detect .planning/ dirs
    "notifications": {
      "enabled": true,
      "phaseComplete": true,
      "milestoneComplete": true
    },
    "ui": {
      "showPlanningPanel": true,
      "planningPanelPosition": "right",  // "left" | "right"
      "roadmapViewStyle": "list"  // "list" | "kanban" | "gantt"
    }
  }
}
```

---

## Migration Path for Claude Code Users

**Goal:** Make it easy for existing Kata Orchestrator users to transition to Kata Agents.

**Import Workflow:**

1. **Detect Claude Code Projects**
   ```
   User opens directory in Kata Agents
   → Detect .planning/ directory
   → Detect .claude/skills/ with kata- prefix
   → Prompt: "Looks like a Kata project! Import orchestration setup?"
   ```

2. **Import Wizard**
   - Copy `.planning/` artifacts (already compatible)
   - Install kata-dev skill pack
   - Import config.json settings
   - Migrate git hooks (if any)
   - Test agent invocation

3. **Compatibility Mode**
   - Support both `/kata:skill` and `/workspace:skill` formats
   - Detect skill invocation format automatically
   - Translate on-the-fly

**Coexistence:**
- Users can use both Claude Code CLI and Kata Agents desktop app
- `.planning/` artifacts shared between both
- Skills work in both environments (same format)
- GitHub integration synchronized

---

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Skill format divergence | High | Low | Use identical SKILL.md format; automated compatibility tests |
| Agent context loading fails | High | Medium | Comprehensive testing; fallback to direct prompt injection |
| UI performance with many artifacts | Medium | Medium | Lazy loading; pagination; virtual scrolling |
| GitHub sync conflicts | Medium | Low | Conflict detection; user resolution UI; rollback capability |
| Skill pack versioning issues | Medium | Medium | Semantic versioning; migration scripts; rollback support |
| User confusion (CLI vs Desktop) | Low | High | Clear documentation; onboarding flow; unified terminology |

---

## Success Metrics

**Phase 1 (Skills Migration):**
- ✅ 26 skills successfully ported
- ✅ All 19 agents working in Kata Agents
- ✅ 100% feature parity with Claude Code orchestrator
- ✅ <5 critical bugs reported in first month
- ✅ Positive feedback from early adopters

**Phase 2 (Native UI):**
- ✅ Planning panel adopted by >70% of orchestration users
- ✅ Artifact watcher <100ms latency
- ✅ UI renders 50+ phase roadmap smoothly
- ✅ GitHub integration used by >40% of users

**Phase 3 (Advanced Features):**
- ✅ Dashboard used weekly by >60% of users
- ✅ Visual plan editor saves >30% planning time
- ✅ Analytics dashboard used by >50% of users
- ✅ Team features adopted by >30% of collaborative teams

---

## Next Steps

### Immediate (This Week)
1. ✅ Create this integration plan
2. ⏳ Review plan with stakeholders
3. ⏳ Decide on phased approach (recommended: Hybrid)
4. ⏳ Set up Phase 1 milestone in kata-agents

### Phase 1 Kickoff (Next 2 Weeks)
1. Create `.kata/agents/` directory structure
2. Port first skill: `starting-projects`
3. Test agent spawning via Task tool
4. Port remaining core skills (7 skills)
5. Create skill pack manifest
6. Write orchestration documentation
7. Create demo video

### Phase 2 Planning (Month 2)
1. Design Planning Panel UI (Figma)
2. Architect artifact watcher service
3. Plan GitHub status integration
4. Prototype roadmap viewer

---

## Open Questions

1. **Skill Pack Distribution:**
   - Host on npm? GitHub releases? Custom registry?
   - Versioning strategy for packs vs individual skills?

2. **Agent Context Loading:**
   - Should agents be pre-processed (variables substituted)?
   - Cache agent files for performance?

3. **Multi-Workspace Orchestration:**
   - Share orchestration state across workspaces?
   - Support monorepo with multiple .planning/ dirs?

4. **GitHub Integration Scope:**
   - Should we build custom GitHub UI or use `gh` CLI?
   - Two-way sync strategy?

5. **Team Collaboration:**
   - How to handle concurrent editing of .planning/ files?
   - Conflict resolution strategy?

6. **Analytics & Telemetry:**
   - What metrics should we track?
   - Privacy considerations?

---

## Conclusion

**Recommended Approach:** Hybrid (3-Phase)

**Why:**
- ✅ Incremental value delivery (ship Phase 1 in 3 weeks)
- ✅ Maintains skill portability between CLI and desktop
- ✅ Leverages existing Kata Agents architecture
- ✅ Enables unique desktop features over time
- ✅ Proven patterns (skills + native UI)

**Next Action:** Review this plan and approve Phase 1 scope.

**Expected Outcome:** Kata Agents becomes the premier desktop interface for spec-driven development, offering powerful orchestration workflows with visual interfaces that accelerate development velocity.

---

**Plan Version:** 1.0
**Author:** Kata Agents
**Date:** 2026-01-30
**Status:** Proposal
