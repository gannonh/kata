---
name: maintaining-monorepo-docs
description: Keep monorepo documentation current during the PR lifecycle. Analyzes diffs, maps code changes to doc pages, and updates or creates MDX content before merge. Invoke explicitly or during PR review.
---

# Maintaining Monorepo Docs

Update documentation in `apps/online-docs/content/docs/` to reflect code changes during the PR lifecycle. This skill fires during PR review (before merge) or when invoked explicitly.

## When to Trigger

- Code changes affect user-facing behavior in any app
- New features, commands, skills, or extensions are added
- Configuration schemas or API surfaces change
- New preference fields are introduced
- Explicitly via `/maintaining-monorepo-docs`

## Workflow

1. **Analyze the diff.** Run `git diff main...HEAD --name-only` to list changed files. Group by app.

2. **Map to doc pages.** Use the table below to identify which doc pages need updates.

3. **Read the affected doc pages.** Understand current content before editing.

4. **Update or create pages.** Edit existing MDX pages to reflect changes. If a change introduces something entirely new (a new command, a new extension), create a new MDX page in the appropriate section.

5. **Note visual-explainer opportunities.** If a change warrants a visual explainer (new architecture, complex flow), add a comment in the PR noting it. Do not auto-generate visual explainers.

6. **Stage doc changes.** Add updated/created MDX files to the PR commit.

## Heuristic Mapping Table

| Source path pattern                       | Target doc page                                            |
| ----------------------------------------- | ---------------------------------------------------------- |
| `apps/cli/src/resources/extensions/`      | `content/docs/cli/extensions.mdx`                          |
| `apps/cli/src/resources/extensions/kata/` | `content/docs/cli/kata-workflow.mdx`                       |
| `apps/cli/src/commands/`                  | `content/docs/cli/commands.mdx`                            |
| `apps/symphony/`                          | `content/docs/symphony/index.mdx`                          |
| `apps/electron/`, `apps/viewer/`          | `content/docs/desktop/index.mdx`                           |
| `apps/context/`                           | `content/docs/context/index.mdx`                           |
| `apps/orchestrator/`                      | `content/docs/orchestrator/index.mdx`                      |
| `packages/core/`                          | `content/docs/architecture/packages.mdx`                   |
| `packages/shared/`                        | `content/docs/architecture/packages.mdx`                   |
| `packages/ui/`                            | `content/docs/architecture/packages.mdx`                   |
| `packages/mermaid/`                       | `content/docs/architecture/packages.mdx`                   |
| New preference fields                     | `content/docs/cli/preferences.mdx`                         |
| New skills                                | Corresponding app section or `content/docs/cli/agents.mdx` |

If a change doesn't map to an existing page and is significant enough to document, create a new page in the appropriate section directory.

## Content Standards

- Use the same frontmatter format as existing pages: `title` and `description` fields
- Match the heading structure of adjacent pages in the same section
- Keep descriptions factual and concise
- Link to related pages within the docs using relative paths
- Do not add content that duplicates inline code comments
