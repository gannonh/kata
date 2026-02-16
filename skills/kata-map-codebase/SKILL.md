---
name: kata-map-codebase
description: Analyze an existing codebase with parallel mapper agents, creating codebase documentation, understanding brownfield projects, or mapping code structure. Triggers include "map codebase", "analyze codebase", "create project context", "document codebase", "understand code", and "codebase map".
metadata:
  version: "1.6.1"
---
<objective>
Analyze existing codebase using parallel kata-codebase-mapper agents to produce structured codebase documents.

Each mapper agent explores a focus area and **writes documents directly** to `.planning/codebase/`. The orchestrator only receives confirmations, keeping context usage minimal.

Output: .planning/codebase/ folder with 7 structured documents, plus .planning/intel/ with compressed agent-readable artifacts (doc-derived summary + code-scanned index and conventions).
</objective>

<execution_context>
@./references/project-analyze.md
</execution_context>

<context>
Focus area: $ARGUMENTS (optional - if provided, tells agents to focus on specific subsystem)

**Load project state if exists:**
Check for .planning/STATE.md - loads context if project already initialized

**This command can run:**
- Before /kata-new-project (brownfield codebases) - creates codebase map first
- After /kata-new-project (greenfield codebases) - updates codebase map as code evolves
- Anytime to refresh codebase understanding
</context>

<when_to_use>
**Use project-analyze for:**
- Brownfield projects before initialization (understand existing code first)
- Refreshing codebase map after significant changes
- Onboarding to an unfamiliar codebase
- Before major refactoring (understand current state)
- When STATE.md references outdated codebase info

**Skip project-analyze for:**
- Greenfield projects with no code yet (nothing to map)
- Trivial codebases (<5 files)
</when_to_use>

<process>
1. Check if .planning/codebase/ already exists (offer to refresh or skip)
2. Create .planning/codebase/ directory structure
3. Spawn 4 parallel kata-codebase-mapper agents:
   - Agent 1: tech focus → writes STACK.md, INTEGRATIONS.md
   - Agent 2: arch focus → writes ARCHITECTURE.md, STRUCTURE.md
   - Agent 3: quality focus → writes CONVENTIONS.md, TESTING.md
   - Agent 4: concerns focus → writes CONCERNS.md
4. Wait for agents to complete, collect confirmations (NOT document contents)
5. Verify all 7 documents exist with line counts
5.5. Generate codebase intelligence artifacts
   - Run the intel generator script:
     ```bash
     node scripts/generate-intel.js
     ```
   - If script fails, show the error to the user and continue (non-blocking)
   - Verify artifacts exist:
     ```bash
     ls .planning/intel/summary.md .planning/intel/index.json .planning/intel/conventions.json
     ```
5.6. Scan source code for structured index
   Run the code scanner to produce code-derived index.json and conventions.json:
   ```bash
   node scripts/scan-codebase.cjs
   ```
   This overwrites the doc-derived index.json and conventions.json from step 5.5 with code-derived data (version 2 schema with per-file imports/exports, naming detection, directory purposes).
   If the script fails, show the error to the user and continue (non-blocking).
   Verify code-scan artifacts:
   ```bash
   node -e "const j=JSON.parse(require('fs').readFileSync('.planning/intel/index.json','utf8')); console.log('index version:', j.version, 'files:', Object.keys(j.files).length)"
   ```
6. Commit codebase map and intel artifacts (`.planning/codebase/` + `.planning/intel/`)
7. Offer next steps (typically: /kata-new-project or /kata-plan-phase)
</process>

<success_criteria>
- [ ] .planning/codebase/ directory created
- [ ] .planning/intel/ directory created with summary.md, index.json, conventions.json
- [ ] All 7 codebase documents written by mapper agents
- [ ] Documents follow template structure
- [ ] Parallel agents completed without errors
- [ ] User knows next steps
</success_criteria>
