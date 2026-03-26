# Per-State Prompt Injection — Design Spec

## Problem

The current WORKFLOW.md is a ~470-line monolith. The agent receives the entire document regardless of what state the issue is in, then must self-route to the correct section. This causes:

1. Agents following the wrong section (e.g. moving to Human Review instead of Agent Review)
2. Contradictory instructions visible simultaneously
3. Wasted context on instructions that don't apply to the current state
4. Two separate workflow files needed for flat tickets vs Kata-planned slices

## Design

### Core Idea

The orchestrator selects a **per-state prompt template** based on the issue's Linear state at dispatch time. The agent receives only the instructions relevant to its current job.

### Prompt Structure

```
prompts/
  shared.md          — repo context, skills, guardrails, Linear schema (always injected)
  in-progress.md     — implementation: load context, code, test, push, open PR, → Agent Review
  agent-review.md    — address PR comments, push fixes, → Human Review
  merging.md         — land the PR via land skill, → Done
  rework.md          — close PR, fresh branch, restart from scratch
  todo.md            — (optional) bootstrap: verify state, create workpad, → delegate to in-progress
```

Each file is a standalone Liquid template with access to `{{ issue.* }}`, `{{ attempt }}`, `{{ workspace.base_branch }}`.

### Prompt Composition

The final prompt sent to the worker is:

```
[shared.md content]

---

[state-specific prompt content]
```

The orchestrator concatenates `shared.md` + the state-specific file. The worker sees one coherent prompt, not a multi-section routing document.

### Flat vs Kata-Planned Issues

Instead of two workflow files, **in-progress.md** handles both flavors by detecting the issue shape:

```liquid
{% if issue.children_count > 0 %}
{# Kata slice: has child task sub-issues #}
This is a Kata-planned slice with {{ issue.children_count }} child tasks.
Load the plan documents from Linear and execute tasks in order...
{% elsif issue.parent_identifier %}
{# Kata task: is a child of a slice issue #}
This is a Kata task under slice {{ issue.parent_identifier }}.
Load the task plan document and execute it...
{% else %}
{# Flat ticket: standalone issue #}
This is a standalone ticket. Read the description, plan, implement, and verify...
{% endif %}
```

The orchestrator enriches the `issue` object with:
- `children_count` — number of child sub-issues
- `parent_identifier` — parent issue identifier (if this is a sub-issue)
- `labels` — already available, can check for `kata:slice` / `kata:task`

### Config Changes

```yaml
# WORKFLOW.md frontmatter
prompts:
  shared: prompts/shared.md        # always included (default: inline after ---)
  by_state:
    In Progress: prompts/in-progress.md
    Agent Review: prompts/agent-review.md
    Merging: prompts/merging.md
    Rework: prompts/rework.md
    Todo: prompts/in-progress.md    # Todo delegates to In Progress
  default: prompts/in-progress.md   # fallback for unmapped states
```

**Backward compatibility:** If `prompts` section is absent, the entire markdown body after `---` is used as the prompt for all states (current behavior). This is a non-breaking change.

### Orchestrator Changes

1. `WorkflowDefinition` gets `prompts: Option<PromptsConfig>` alongside `prompt_template`
2. `ServiceConfig` gets `prompts: Option<PromptsConfig>`
3. When building `WorkerTaskConfig`, resolve the prompt:
   - If `prompts` configured: read `shared.md` + state-specific file, concatenate
   - If not: use `prompt_template` as today
4. `render_prompt` receives the resolved template string (no change to rendering logic)
5. Prompt files are resolved relative to the WORKFLOW.md directory
6. Files are read at dispatch time (not cached) so hot-reload works

### Issue Enrichment

`prompt_builder::render_prompt` gains new template variables:

| Variable | Type | Source |
|----------|------|--------|
| `issue.children_count` | integer | Count of child sub-issues from Linear |
| `issue.parent_identifier` | string/nil | Parent issue identifier if this is a sub-issue |
| `issue.has_label_kata_slice` | boolean | True if issue has `kata:slice` label |
| `issue.has_label_kata_task` | boolean | True if issue has `kata:task` label |

These are fetched during candidate normalization (already fetches labels and relations).

### File Size Comparison

| Current | Per-state |
|---------|-----------|
| WORKFLOW-symphony.md: ~470 lines | shared.md: ~80 lines |
| WORKFLOW-cli.md: ~350 lines | in-progress.md: ~120 lines |
| | agent-review.md: ~40 lines |
| | merging.md: ~20 lines |
| | rework.md: ~20 lines |
| **820 lines total (2 files)** | **~280 lines total (5 files, one workflow)** |

### Migration Path

1. Ship per-state prompts as an opt-in feature behind `prompts:` config
2. Current `prompt_template` (body after `---`) continues to work unchanged
3. Provide example `prompts/` directory alongside existing example workflow files
4. Eventually deprecate the monolith approach once per-state is proven

## Implementation Tasks

1. **Config parsing** — parse `prompts` section in frontmatter, resolve file paths
2. **Prompt resolution** — read and concatenate shared + state-specific files at dispatch
3. **Issue enrichment** — add `children_count`, `parent_identifier`, label booleans to Issue/template vars
4. **Extract prompts from monolith** — split existing WORKFLOW-symphony.md into per-state files
5. **Merge flat + CLI workflows** — write `in-progress.md` with Liquid conditionals for issue shape detection
6. **Tests** — config parsing, prompt resolution, template rendering with new variables
7. **Documentation** — update WORKFLOW-REFERENCE.md and README
