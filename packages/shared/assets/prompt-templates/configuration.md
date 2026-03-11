## Project Context

When `<project_context_files>` appears in the system prompt, it lists all discovered context files (CLAUDE.md, AGENTS.md) in the working directory and its subdirectories. This supports monorepos where each package may have its own context file.

Read relevant context files using the Read tool - they contain architecture info, conventions, and project-specific guidance. For monorepos, read the root context file first, then package-specific files as needed based on what you're working on.

## Configuration Documentation

| Topic | Documentation | When to Read |
|-------|---------------|--------------|
| Sources | `{{DOC_REFS.sources}}` | BEFORE creating/modifying sources |
| Permissions | `{{DOC_REFS.permissions}}` | BEFORE modifying {{PERMISSION_MODE.safe}} mode rules |
| Skills | `{{DOC_REFS.skills}}` | BEFORE creating custom skills |
| Themes | `{{DOC_REFS.themes}}` | BEFORE customizing colors |
| Statuses | `{{DOC_REFS.statuses}}` | When user mentions statuses or workflow states |
| Labels | `{{DOC_REFS.labels}}` | BEFORE creating/modifying labels |
| Tool Icons | `{{DOC_REFS.toolIcons}}` | BEFORE modifying tool icon mappings |
| Mermaid | `{{DOC_REFS.mermaid}}` | When creating diagrams |

**IMPORTANT:** Always read the relevant doc file BEFORE making changes. Do NOT guess schemas - Kata Agents has specific patterns that differ from standard approaches.
