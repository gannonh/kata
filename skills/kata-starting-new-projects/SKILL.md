---
name: kata-starting-new-projects
description: Use this skill when starting a new project, onboarding a new user,initializing a Kata project, creating PROJECT.md, onboarding a new codebase, or setting up project structure. Triggers include "new project", "start project", "initialize kata", "setup project", "create project", and "onboard". This skill orchestrates discovery interviews, research, requirements gathering, and roadmap creation.
---

# Project Initialization Orchestrator

Handles new project onboarding through deep discovery, research (optional), requirements gathering, and initial roadmap creation.

## When to Use

- User says "new project" or "start a project"
- User wants to initialize Kata in an existing codebase
- User asks to "create PROJECT.md" or "set up planning"
- User mentions "onboarding" a project

## Workflow Overview

```
1. Check for existing project
2. Detect brownfield (existing code)
3. Run discovery interview
4. Create PROJECT.md
5. Configure workflow preferences
6. Run domain research (optional)
7. Define requirements
8. Spawn kata-roadmapper
9. Present completion
```

## Execution Flow

### Step 1: Setup and Validation

**Check for existing project:**

```bash
if [ -f .planning/PROJECT.md ]; then
  echo "Project already initialized"
fi
```

If exists, offer to resume with `/kata:progress` or reset.

**Initialize git if needed:**

```bash
if [ ! -d .git ] && [ ! -f .git ]; then
  git init
fi
```

### Step 2: Brownfield Detection

Detect existing code:

```bash
CODE_FILES=$(find . -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" 2>/dev/null | grep -v node_modules | grep -v .git | head -20)
HAS_PACKAGE=$([ -f package.json ] || [ -f requirements.txt ] || [ -f Cargo.toml ] || [ -f go.mod ] && echo "yes")
```

**If existing code detected:**

Ask user:
- "Map codebase first" - Run `/kata:map-codebase` to understand architecture
- "Skip mapping" - Proceed with initialization

### Step 3: Discovery Interview

Display stage banner:
```
KATA > QUESTIONING
```

Spawn kata-project-researcher for discovery:

```
Task(
  prompt=discovery_prompt,
  subagent_type="kata-project-researcher",
  description="Discovery interview"
)
```

Discovery questions (follow the thread, don't interrogate):

1. **"What do you want to build?"** - Open the conversation
2. **Follow-up on their response** - Dig into what they mentioned
3. **Probe for specifics:**
   - What excited them
   - What problem sparked this
   - What they mean by vague terms
   - What it would actually look like
   - What's already decided

**Decision gate:** When you could write a clear PROJECT.md, ask:
- "Create PROJECT.md" - Move forward
- "Keep exploring" - Ask more questions

See `./references/discovery-protocol.md` for detailed questioning techniques.

### Step 4: Create PROJECT.md

Create `.planning/` directory:

```bash
mkdir -p .planning
```

Synthesize discovery into PROJECT.md using template structure:

- **What This Is** - Current accurate description (2-3 sentences)
- **Core Value** - The ONE thing that matters most
- **Requirements** - Validated (existing), Active (hypotheses), Out of Scope
- **Context** - Background information
- **Constraints** - Hard limits (tech, timeline, budget)
- **Key Decisions** - Significant choices made during discovery

See `./references/project-template.md` for full template.

**Commit PROJECT.md:**

```bash
git add .planning/PROJECT.md
git commit -m "docs: initialize project

[One-liner from What This Is section]"
```

### Step 5: Configure Workflow Preferences

Ask all preferences in one question:

**Mode:**
- YOLO (Recommended) - Auto-approve, just execute
- Interactive - Confirm at each step

**Depth:**
- Quick - Ship fast (3-5 phases, 1-3 plans each)
- Standard - Balanced (5-8 phases, 3-5 plans each)
- Comprehensive - Thorough (8-12 phases, 5-10 plans each)

**Execution:**
- Parallel (Recommended) - Independent plans run simultaneously
- Sequential - One plan at a time

Create `.planning/config.json` with preferences.

**Commit config:**

```bash
git add .planning/config.json
git commit -m "chore: add project config

Mode: [mode]
Depth: [depth]
Parallelization: [enabled/disabled]"
```

### Step 6: Research Decision

Ask user:
- "Research first (Recommended)" - Discover standard stacks, features, patterns
- "Skip research" - Go straight to requirements

**If "Research first":**

Display:
```
KATA > RESEARCHING
Researching [domain] ecosystem...
```

Spawn 4 parallel kata-project-researcher agents:

1. **Stack research** - Standard 2025 stack for domain
2. **Features research** - Table stakes vs differentiators
3. **Architecture research** - System structure patterns
4. **Pitfalls research** - Common mistakes to avoid

After all complete, spawn synthesizer for SUMMARY.md.

Output files in `.planning/research/`:
- STACK.md
- FEATURES.md
- ARCHITECTURE.md
- PITFALLS.md
- SUMMARY.md

**Commit research:**

```bash
git add .planning/research/
git commit -m "docs: add domain research

[domain] ecosystem surveyed"
```

### Step 7: Define Requirements

Display:
```
KATA > DEFINING REQUIREMENTS
```

**If research exists:**
- Read FEATURES.md
- Present features by category (table stakes, differentiators)
- For each category, ask which features are in v1

**If no research:**
- Ask "What are the main things users need to be able to do?"
- Clarify each capability
- Group into categories

**Track for each requirement:**
- Selected = v1 requirements
- Unselected table stakes = v2 (users expect these)
- Unselected differentiators = out of scope

**Generate REQUIREMENTS.md:**
- v1 Requirements grouped by category with REQ-IDs
- v2 Requirements (deferred)
- Out of Scope (explicit exclusions with reasoning)
- Traceability section (empty, filled by roadmap)

**REQ-ID format:** `[CATEGORY]-[NUMBER]` (AUTH-01, CONTENT-02)

**Present full requirements list for confirmation.**

**Commit requirements:**

```bash
git add .planning/REQUIREMENTS.md
git commit -m "docs: define v1 requirements

[X] requirements across [N] categories
[Y] requirements deferred to v2"
```

### Step 8: Create Roadmap

Display:
```
KATA > CREATING ROADMAP
Spawning roadmapper...
```

Spawn kata-roadmapper:

```
Task(
  prompt=roadmap_prompt,
  subagent_type="kata-roadmapper",
  description="Create roadmap"
)
```

Roadmap prompt includes:
- PROJECT.md content (core value, constraints)
- REQUIREMENTS.md content (v1 requirements with REQ-IDs)
- research/SUMMARY.md content (if exists)
- config.json (depth setting)

See `./references/roadmap-creation.md` for roadmap structure.

**Handle roadmapper return:**

**If ROADMAP BLOCKED:**
- Present blocker
- Work with user to resolve
- Re-spawn when resolved

**If ROADMAP CREATED:**
- Present roadmap summary inline
- Ask for approval:
  - "Approve" - Commit and continue
  - "Adjust phases" - Get feedback, re-spawn with revision
  - "Review full file" - Show raw ROADMAP.md

**Commit roadmap (after approval):**

```bash
git add .planning/ROADMAP.md .planning/STATE.md .planning/REQUIREMENTS.md
git commit -m "docs: create roadmap ([N] phases)

Phases:
1. [phase-name]: [requirements covered]
2. [phase-name]: [requirements covered]
...

All v1 requirements mapped to phases."
```

### Step 9: Present Completion

Output this markdown directly (not as a code block):

KATA > PROJECT INITIALIZED

**[Project Name]**

| Artifact     | Location                    |
| ------------ | --------------------------- |
| Project      | `.planning/PROJECT.md`      |
| Config       | `.planning/config.json`     |
| Research     | `.planning/research/`       |
| Requirements | `.planning/REQUIREMENTS.md` |
| Roadmap      | `.planning/ROADMAP.md`      |

**[N] phases** | **[X] requirements** | Ready to build

───────────────────────────────────────────────────────────────

## ▶ Next Action

**Phase 1: [Phase Name]** — [Goal from ROADMAP.md]

> Instructions can be given conversationally (recommended) or via /commands.

| Action                | Natural Trigger      | Explicit Command           |
| --------------------- | -------------------- | -------------------------- |
| ⭐ **Plan the phase**  | "Plan phase 1"       | `/kata-planning-phases`    |
| Research first        | "Research phase 1"   | `/kata-researching-phases` |

<sub>★ recommended · /clear first → fresh context window</sub>

───────────────────────────────────────────────────────────────

## Key References

For detailed guidance:

- **Discovery protocol:** See `./references/discovery-protocol.md` for interview questions, follow-up patterns
- **Project template:** See `./references/project-template.md` for PROJECT.md structure
- **Roadmap creation:** See `./references/roadmap-creation.md` for ROADMAP.md structure, milestone definition

## Quality Standards

Initialization complete when:

- [ ] .planning/ directory created
- [ ] Git repo initialized
- [ ] Brownfield detection completed
- [ ] Discovery interview completed (threads followed, not rushed)
- [ ] PROJECT.md captures full context (committed)
- [ ] config.json has workflow preferences (committed)
- [ ] Research completed if selected (committed)
- [ ] Requirements gathered with REQ-IDs (committed)
- [ ] ROADMAP.md created with phases and success criteria
- [ ] STATE.md initialized
- [ ] User knows next step

## Sub-Agent Summary

| Agent                   | Purpose                              | When Spawned                                  |
| ----------------------- | ------------------------------------ | --------------------------------------------- |
| kata-project-researcher | Discovery interview, domain research | Discovery phase, research phase (4x parallel) |
| kata-roadmapper         | Create ROADMAP.md, STATE.md          | After requirements defined                    |
