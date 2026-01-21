---
name: kata-showing-available-commands-and-usage-guides
description: Use this skill for displaying available Kata commands, usage guides, and help documentation. Triggers include "kata help", "help with kata", "show commands", "kata commands", "what commands", "list commands", "available commands", "how to use kata", "kata usage", "kata guide", "kata documentation", "show me kata", "what can kata do", "kata features", "help me with kata", "kata reference", "command list".
---

# Command Reference & Usage Guide Orchestrator

Displays Kata commands, usage guides, and help documentation.

## When to Use

- User asks for help ("kata help", "how to use kata")
- User wants to see available commands ("show commands", "what commands")
- User needs usage guidance ("kata guide", "kata documentation")
- User is exploring Kata features ("what can kata do")

## Workflow Overview

```
1. Determine help context (general, specific command, workflow)
2. Display appropriate reference content
3. Provide usage examples and next steps
```

## Execution Flow

### Step 1: Determine Help Context

Parse user request to identify what type of help is needed:

| Trigger Keywords                                    | Context         |
| --------------------------------------------------- | --------------- |
| "kata help", "show commands", "list commands"       | COMMAND_LIST    |
| "how to use {command}", "help with {command}"       | SPECIFIC_COMMAND|
| "how to use kata", "kata guide", "getting started"  | USAGE_GUIDE     |
| "what can kata do", "kata features", "capabilities" | FEATURE_OVERVIEW|

### Step 2: Route to Help Content

Based on help context, display the appropriate content.

---

## COMMAND_LIST Context

Display all available Kata commands organized by category.

Output this markdown directly (not as a code block):

KATA > AVAILABLE COMMANDS

Kata provides structured workflows for spec-driven development.

## Project Setup

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `/kata:project-new`   | Initialize new Kata project          |
| `/kata:project-status`| Show current phase and progress      |

## Milestones

| Command                    | Description                     |
| -------------------------- | ------------------------------- |
| `/kata:milestone-new`      | Create new milestone            |
| `/kata:milestone-complete` | Mark milestone complete         |
| `/kata:milestone-audit`    | Review milestone health         |

## Roadmap Management

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `/kata:phase-add`        | Add phase to current milestone     |
| `/kata:phase-insert`     | Insert urgent phase (decimal)      |
| `/kata:phase-remove`     | Remove phase from roadmap          |
| `/kata:roadmap-plan-gaps`| Generate phases from requirements  |

## Research & Planning

| Command                 | Description                          |
| ----------------------- | ------------------------------------ |
| `/kata:phase-discuss`   | Gather phase context (pre-planning)  |
| `/kata:phase-research`  | Research phase domain                |
| `/kata:phase-assumptions`| Document assumptions                |
| `/kata:phase-plan`      | Create execution plans               |

## Execution & Verification

| Command              | Description                             |
| -------------------- | --------------------------------------- |
| `/kata:phase-execute`| Execute phase plans                     |
| `/kata:quick`        | Execute small task without planning     |
| `/kata:work-verify`  | Verify goals and run UAT                |

## Session Management

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `/kata:work-pause`  | Pause work and save continuation state   |
| `/kata:work-resume` | Resume from saved state                  |

## Utilities

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `/kata:codebase-map`   | Map codebase structure and decisions |
| `/kata:todo-add`       | Capture idea or task                 |
| `/kata:todo-check`     | Review pending todos                 |
| `/kata:workflow-debug` | Debug workflow or agent issues       |
| `/kata:help`           | Show this help                       |
| `/kata:update`         | Update to latest Kata version        |
| `/kata:whats-new`      | View recent changes                  |

---

**Getting started:**
"how to use kata" for workflow guide
"help with {command}" for command details

See `./references/command-reference.md` for full documentation.

---

## SPECIFIC_COMMAND Context

Display detailed help for a specific command.

### Step SC-1: Parse Command Name

Extract command name from user request:
- "help with phase-plan" → `phase-plan`
- "how to use quick" → `quick`
- "what does project-new do" → `project-new`

### Step SC-2: Load Command Details

Read command file from `commands/kata/{command-name}.md` to extract:
- Full command name (from frontmatter `name`)
- Description (from frontmatter `description`)
- Arguments (from frontmatter `argument-hint`)
- Usage examples (from command content)

**If command file not found:**
```
Command not found: {command-name}

Use "kata help" to see available commands.
```
Exit skill.

### Step SC-3: Display Command Help

Output this markdown directly (not as a code block):

KATA > COMMAND HELP

## /kata:{command-name}

{description from command file}

**Usage:**
```
/kata:{command-name} {argument-hint}
```

**Examples:**
{examples extracted from command file}

**Related commands:**
{related commands based on category}

---

For general help: "kata help" or `/kata:help`

---

## USAGE_GUIDE Context

Display general Kata workflow and usage guidance.

Output this markdown directly (not as a code block):

KATA > USAGE GUIDE

Kata is a spec-driven development framework that helps Claude build software systematically.

## Core Workflow

```
1. PROJECT SETUP
   /kata:project-new
   - Define vision and goals
   - Create initial requirements

2. MILESTONES
   /kata:milestone-new
   - Set release boundaries
   - Define deliverables

3. ROADMAP PLANNING
   /kata:roadmap-plan-gaps
   - Generate phases from requirements
   - Review and adjust phase breakdown

4. PHASE EXECUTION
   For each phase:
   a. /kata:phase-discuss   (gather context)
   b. /kata:phase-research  (if needed)
   c. /kata:phase-plan      (create execution plans)
   d. /kata:phase-execute   (run plans with atomic commits)
   e. /kata:work-verify     (verify goals, run UAT)

5. ITERATE
   Repeat phase execution until milestone complete
   /kata:milestone-complete
```

## Common Workflows

**Start new project:**
1. `/kata:project-new` → define vision
2. `/kata:milestone-new` → set first milestone
3. `/kata:roadmap-plan-gaps` → generate phases

**Build a feature:**
1. `/kata:phase-discuss {N}` → gather context
2. `/kata:phase-plan {N}` → create plans
3. `/kata:phase-execute {N}` → run plans
4. `/kata:work-verify {N}` → test and verify

**Quick task:**
1. "quick: {description}" → direct execution
2. Or: `/kata:quick` → interactive prompt

**Capture idea:**
1. "todo: {description}" → add to backlog
2. "check todos" → review and action

## Key Principles

**Plans are prompts:** PLAN.md files are executable specifications, not documents to transform.

**Atomic commits:** Every task produces one focused commit, making history git-bisect friendly.

**Context management:** Kata manages Claude's 200k context window deliberately with sub-agents.

**Progressive disclosure:** Information flows through layers: commands → workflows → templates → references.

---

**Need specific help?**
"help with {command}" for command details
"kata commands" for full command list

See `./references/command-reference.md` for detailed documentation.

---

## FEATURE_OVERVIEW Context

Display Kata capabilities and feature highlights.

Output this markdown directly (not as a code block):

KATA > FEATURES

Kata provides structured workflows for spec-driven development with Claude.

## Core Capabilities

**Systematic Planning**
- Phase-based roadmaps with dependency management
- Milestone tracking and health monitoring
- Requirements-driven phase generation
- Atomic task breakdown (2-3 tasks per plan)

**Autonomous Execution**
- Sub-agent orchestration (fresh 200k context each)
- Parallel plan execution (wave-based)
- Checkpoint protocol (verification gates)
- Automatic deviation handling (bugs, blockers)

**Quality Assurance**
- Goal-based verification (not just tests)
- User Acceptance Testing (UAT) protocols
- Debug workflows for failure analysis
- Git bisect-friendly atomic commits

**Context Engineering**
- Progressive disclosure (commands → workflows → references)
- State preservation across sessions (STATE.md)
- Agent history tracking (resume capabilities)
- Size-aware splitting (manage Claude's context window)

**Developer Experience**
- Natural language + explicit commands
- Interactive decision gates (AskUserQuestion)
- Session pause/resume
- Todo capture and review
- Version management and updates

## Design Philosophy

**Solo developer + Claude workflow**
No enterprise patterns, optimized for individual productivity.

**Plans as executable prompts**
PLAN.md files are XML specifications for Claude, not prose documents.

**Git history as context**
Atomic commits provide future Claude instances with execution context.

**Fail gracefully**
Checkpoints, verification gates, and debug workflows prevent runaway execution.

---

**Get started:**
"how to use kata" for workflow guide
"kata commands" for command list

See `./references/command-reference.md` for complete documentation.

---

## Key References

- **Full command reference:** See `./references/command-reference.md`
- **Common workflows:** See `./references/command-reference.md`
- **Usage tips:** See `./references/command-reference.md`

## Quality Standards

Help content must:

- [ ] Provide actionable next steps
- [ ] Use clear categorization
- [ ] Include relevant examples
- [ ] Link to detailed documentation
- [ ] Support both new and experienced users
