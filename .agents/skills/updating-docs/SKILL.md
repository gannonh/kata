---
name: updating-docs
description: Use after making changes to CLI features (apps/cli), preferences, extensions, agent behavior, or configuration. Triggers when modifying code in apps/cli/src/ that affects user-facing behavior, preferences schema, agent context, or CLI capabilities. Also use when adding/removing/renaming commands, skills, extensions, or preference fields. Fires on phrases like "update docs", "sync documentation", or proactively when implementation changes land.
---

# Updating Documentation

When you change CLI behavior, preferences, extensions, or agent-facing context, check whether these files need corresponding updates. They fall out of sync easily because they live apart from the implementation code.

## Files to check

### 1. Preferences Reference (end-user docs)

`apps/cli/src/resources/extensions/kata/docs/preferences-reference.md`

Documents every preferences field, its type, default, and behavior. Update when:

- Adding, removing, or renaming a preference field
- Changing a field's type, default value, or accepted values
- Changing how a preference affects runtime behavior

### 2. Preferences Template (end-user default)

`apps/cli/src/resources/extensions/kata/templates/preferences.md`

The YAML frontmatter template copied into new projects on init. Update when:

- Adding a new preference field (add it with its default)
- Removing a field (remove it from the template)
- Changing a default value

Keep template and reference in sync: every field in the template should be documented in the reference, and vice versa.

### 3. Agent Context (agent-facing)

`apps/cli/src/resources/AGENTS.md`

Tells the agent about CLI architecture, directory structure, extensions, and capabilities. Update when:

- Adding or removing extensions, commands, or skills
- Changing directory structure or file roles
- Changing how the agent should interact with the system
- Adding new agent prompt templates

### 4. README (end-user overview)

`apps/cli/README.md`

User-facing overview of CLI features, setup, and usage. Update when:

- Adding or removing user-visible features or commands
- Changing setup steps, authentication flow, or CLI flags
- Changing supported providers or integrations

### 5. Visual-explainers

`apps/cli/docs/visual-explainers`

Diagrams and walkthroughs of CLI workflows, agent interactions, and user journeys. Update when:

- Changing how the agent interacts with the system or user
- Changing the flow of user commands or agent actions
- Adding new features that affect user or agent workflows

## Workflow

After completing an implementation change, scan through each file above and ask: "Does this file describe something I just changed?" If yes, update it. If unsure, read the relevant section to check.

Do not update files speculatively for changes that haven't happened yet. Only update what reflects the actual current state of the code.
