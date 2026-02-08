# Extension Model Report

How Kata's preferences system scales beyond simple config to project-local customization.

## Core Problem

CLAUDE.md does not propagate to subagents. Kata's multi-agent architecture means the main orchestrator spawns subagents with fresh 200k context windows. Each subagent's behavior is controlled by skill references inlined at spawn time, not by CLAUDE.md or project-level settings.

Config keys (`.planning/config.json`) control orchestrator decisions: which agents to spawn, which model to use, whether to commit docs. But they cannot express project-specific output formats, verification commands, or workflow steps that need to reach subagent prompts.

The question is not "how do users customize Kata skills?" but "how do users inject project-specific context into subagent prompts?"

Every mechanism that works (template overrides, config workflow variants, hooks) works because it places project-specific content where skills can inline it into subagent prompts. Every mechanism that fails (skill shadowing, composable fragments) fails because it tries to change the skill structure itself rather than the content the skill inlines.

## Three Real Customization Gaps

These illustrate needs that config.json + CLAUDE.md cannot handle today:

1. **Changelog format.** `kata-complete-milestone` hardcodes changelog generation via `changelog-generator.md`. A project using a different format has no way to influence the subagent that generates the changelog.

2. **Verification commands.** `kata-verify-work` and the verifier agent have no way to know this project requires `npx expo build:ios --dry-run` or `cargo test --workspace`. Config has `workflow.verifier: true/false` but no way to specify what verification means.

3. **Summary template sections.** The summary template is embedded in `execute-phase/references/summary-template.md`. A project that needs "Deployment Notes" or "Security Review" sections in every summary has no mechanism to add them.

---

## Recommended Approach

Two mechanisms ship first; a third waits for demonstrated need.

### 1. Template Overrides (Ship First)

Projects place templates at `.planning/templates/{name}.md`. Skills check the project directory before falling back to the plugin default embedded in their references.

**Resolution logic:** When a skill needs a template, check `.planning/templates/{name}.md` first. If found, use it. If not, use the plugin default.

**Extractable templates for v1:**

| Template Name | Current Location | Used By | Customization Target |
|---|---|---|---|
| `summary-template.md` | Embedded in `execute-phase/references/execute-plan.md` and `phase-execute.md` (no standalone file; extraction required) | Executor subagent | Output sections, metadata fields |
| `changelog-entry.md` | `complete-milestone/references/changelog-generator.md` | Milestone completion | Changelog format (Keep a Changelog, Conventional, custom) |
| `plan-template.md` | `plan-phase/references/planner-instructions.md` (lines 375-440) | Planner subagent | Plan structure, frontmatter fields |
| `uat-template.md` | `verify-work/references/UAT-template.md` | UAT workflow | Test report format, result categories |
| `verification-report.md` | `verify-work/references/verifier-instructions.md` | Verifier subagent | Verification output format |

**Forward compatibility:** Each template includes a schema comment at the top listing required fields: `<!-- Required fields: objective, tasks_completed, commits -->`. When Kata adds new required fields in a plugin update, the session-start hook compares project templates against current schema and warns about missing fields. Warning only, not blocking.

**Scope:** Small. Extract 5 templates from inline references. Add resolution function to skills that use templates. Document the override pattern.

**Risk profile:** Low. Templates affect output shape, not execution flow. A missing field produces a slightly incomplete summary, not a broken workflow.

### 2. Config-Driven Workflow Variants (Ship Second)

Extend `config.json` with per-skill `workflows` sections. Skills read their section and incorporate values into subagent prompts.

**Proposed schema:**

```json
{
  "workflows": {
    "execute-phase": {
      "post_task_command": "pytest --tb=short",
      "commit_style": "conventional",
      "commit_scope_format": "{phase}-{plan}"
    },
    "verify-work": {
      "extra_verification_commands": [
        "npx expo build:ios --dry-run",
        "cargo test --workspace"
      ]
    },
    "complete-milestone": {
      "version_files": ["package.json", "pyproject.toml"],
      "pre_release_commands": ["make docs", "make lint"]
    }
  }
}
```

**Key design decisions:**

- Each skill reads at most 3-5 keys from its section. Keep the config surface small.
- Values are strings or string arrays (commands, format names). Not arbitrary prompt text.
- Skills inject these values into subagent prompts as structured context, e.g., "After each task, run: `pytest --tb=short`."
- Schema validation on session start: unknown keys warn, invalid value types error.
- `/kata-configure-settings` gains a "Workflow" section to manage these keys interactively.

**Scope:** Medium. Extend config schema. Update 3-4 skills to read workflow sections. Add validation. Update settings skill.

**Risk profile:** Low-Medium. JSON limits expressiveness, which is a feature: it prevents users from writing complex prompt fragments in config. The 80/20 rule applies: config handles common needs (custom commands, format names), and anything beyond that is out of scope for config.

### 3. Hook Points (Deferred)

Prompt fragment files at `.planning/hooks/{skill-name}/{hook-name}.md` that skills inline at named injection points.

**Deferred because:** Config workflow variants handle "run this command" needs. Hooks are necessary only when customization requires Claude to *reason* about something project-specific that cannot be expressed as a command string. Example: "After verification, check if any new API endpoints were added and verify they have rate limiting middleware." This is a judgment call, not a command.

**When to build:** After template overrides and config variants have been deployed and users report needs that neither can handle. The signal is: "I need Claude to do something project-specific that I can't express as a shell command or a config value."

**If built, the initial scope should be narrow:** 3 hooks in 2 skills (post-task and pre-commit in execute-phase, post-verify in verify-work). Each hook file limited to ~200 tokens. Hook content wrapped with `<!-- BEGIN PROJECT HOOK: {name} -->` markers for debugging. Hook point names become a versioning contract.

---

## Rejected Approaches

### Skill Shadowing (Rejected)

Projects create `.claude/skills/kata-{name}/SKILL.md` to shadow plugin skills.

**Why rejected:**
- Claude Code does not document skill precedence when project and plugin skills share a name. The docs recommend namespacing to avoid collisions, implying collisions are problems, not features.
- `@`-reference paths from project skills cannot resolve to plugin `references/` directories. `./` resolves relative to the project skill, not the plugin.
- Full skill replacement with no merge semantics. Users fork 700+ line SKILL.md files and maintain parallel versions.
- Upgrade breakage is silent. When Kata v1.8 changes a skill's structure, shadow skills break mid-execution.

### Composable Skill Fragments (Rejected)

Extract shared behaviors (git commit, verification) into named fragments. Projects override fragments, all consuming skills pick up the change.

**Why rejected:**
- Requires refactoring all 30 skills. Massive scope for uncertain return.
- Fragment dependencies create cross-skill coupling. A bug in one fragment cascades to every consumer. Current self-contained skills isolate failures.
- The use case (change git commit behavior across all skills) is rare. Conventional commits is a config key, not a fragment override.

### Project Profiles (Premature)

Built-in profiles for project archetypes (api-service, mobile-app, monorepo) that bundle config + hooks + templates.

**Why premature:**
- Profiles compose primitives (templates, config variants, hooks). Building the composition layer before primitives exist is backwards.
- Maintenance burden scales multiplicatively: 5 profiles x 30 skills = 150 combinations.
- Projects rarely fit one archetype cleanly. Hybrid projects need escape hatches that defeat the simplicity profiles provide.
- Right time: after template overrides and config variants have been used on real projects and recurring customization clusters emerge.

---

## Migration and Forward Compatibility

When a Kata update changes default templates or adds new config keys, existing projects need to be informed without breaking.

**Strategy: warn, don't block.**

- **Template drift:** Session-start hook compares project templates (`.planning/templates/`) against current plugin schema comments. If a required field is missing, emit a warning: `"Project template summary-template.md is missing required field: commits. The default template includes this field."` The skill still uses the project template. The user decides whether to update.

- **Config schema evolution:** New config keys get defaults. Existing projects without the key use the default. `/kata-configure-settings` detects missing keys and offers to add them (this already works today for boolean toggles; extend it to workflow sections).

- **No automatic migration.** Projects that override templates or config own those overrides. Kata does not silently modify project files.

---

## Implementation Roadmap

**Phase 1: Template Overrides**
- Extract 5 templates from inline references into standalone files within skills
- Add template resolution logic (check `.planning/templates/`, fall back to default)
- Add schema comments to each template
- Add session-start drift detection
- Document template override pattern

**Phase 2: Config Workflow Variants**
- Extend config.json schema with `workflows` section
- Update execute-phase, verify-work, complete-milestone to read workflow config
- Add schema validation (warn on unknown keys, error on invalid types)
- Update `/kata-configure-settings` with workflow management
- Document per-skill config keys

**Phase 3: Hook Points (If Needed)**
- Deferred until phases 1-2 are deployed and user feedback indicates gaps
- If built: 3 hooks in 2 skills, narrow scope, prove the pattern
- Decision gate: 3+ user requests for customization that templates and config cannot handle
