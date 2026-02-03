# Kata Workflow Diagrams

Visual documentation of Kata's architecture and workflow paths.

These diagrams help users and future Claude instances understand how Kata orchestrates development workflows, from project initialization through milestone completion.

## Diagrams

| Diagram | Purpose |
| --- | --- |
| [1. High-Level Orchestration](FLOWS.md#1-high-level-orchestration) | How users interact with skills and agents |
| [2. Project Lifecycle](FLOWS.md#2-project-lifecycle) | State machine from project creation to milestone completion |
| [3. Planning Flow](FLOWS.md#3-planning-flow) | Research, planning, and verification loop |
| [4. Execution Flow](FLOWS.md#4-execution-flow) | Wave-based parallelization with checkpoints |
| [5. Verification Flow](FLOWS.md#5-verification-flow) | UAT testing and gap closure workflow |
| [6. PR Workflow](FLOWS.md#6-pr-workflow) | Branch-based PR workflow with GitHub integration |

## Rendering

- **GitHub**: Renders Mermaid diagrams natively in markdown preview
- **Editing**: Use [mermaid.live](https://mermaid.live) for interactive editing
- **VS Code**: Install "Markdown Preview Mermaid Support" extension

## Architecture Overview

Kata uses a **thin orchestrator + specialized agents** pattern:

1. **User** invokes skills via `/kata:kata-skill-name` or natural language
2. **Skills** (orchestrators) parse arguments, validate state, spawn subagents
3. **Subagents** execute specialized tasks with fresh context (via Task tool)
4. **Artifacts** (PLAN.md, SUMMARY.md, etc.) persist state across sessions

Key skills:
- `starting-projects` - Initialize new projects
- `adding-milestones` - Define milestones with research and roadmap
- `planning-phases` - Create executable plans for roadmap phases
- `executing-phases` - Execute plans with wave parallelization
- `verifying-work` - UAT testing and gap closure
- `reviewing-pull-requests` - Multi-agent code review

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project overview and development guide
- [KATA-STYLE.md](../../KATA-STYLE.md) - Style guide for Kata development
- Skills: `skills/*/SKILL.md`
- Agents: `agents/kata-*.md`
