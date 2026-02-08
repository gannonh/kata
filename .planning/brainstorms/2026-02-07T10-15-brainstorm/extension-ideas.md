# Extension Model Ideas

Proposals for how Kata's preferences system scales beyond simple config keys into project-local skill overrides, template customization, and custom workflow behavior.

## Context

Kata ships as a read-only plugin (`~/.claude/plugins/kata/`). Projects store state in `.planning/` and config in `.planning/config.json`. Claude Code supports project-level skills in `.claude/skills/` that coexist with plugin skills. When multiple skills match a trigger, Claude picks the best match.

The gap: config.json handles boolean toggles and string enums. It cannot express "use a different summary template" or "add iOS simulator verification after execution" or "generate changelogs in Keep a Changelog format."

---

## Idea 1: Project Skill Shadowing via Naming Convention

**What:** Projects create `.claude/skills/kata-{skill-name}/SKILL.md` files that shadow or extend the corresponding plugin skill. Claude Code's native skill matching picks the project-local version when names collide. Kata documents a "shadow skill" pattern where project skills `@`-reference the plugin skill's references and add project-specific behavior.

**Example:** A mobile app project creates `.claude/skills/kata-verify-work/SKILL.md` that wraps the standard verify-work skill with an additional step: "After standard verification, run `npx expo start` and prompt user to check the iOS simulator." The skill imports Kata's verification references (`@./references/verify-work.md` from the plugin) and appends project-specific checks.

**Why:** Zero new infrastructure. Claude Code already resolves project skills over plugin skills with same name. Projects get full control over any workflow step. The plugin's `references/` directory acts as a library of composable building blocks.

**Scope:** Small. Documentation + 2-3 example shadow skills + a `/kata-eject-skill` helper that scaffolds a project skill from a plugin skill.

**Risks:**
- Fragile coupling: shadow skills break when plugin skills change internal structure between versions.
- No merge semantics: you replace the entire skill, you cannot "add one step."
- Users must understand Kata skill internals to shadow effectively.
- `@`-reference paths from project skills to plugin references may not resolve correctly (plugin is installed at a different path than the project).

---

## Idea 2: Hook Points in Skills (Before/After Extensibility)

**What:** Skills define named hook points (e.g., `<hook name="post-verify">`, `<hook name="pre-commit">`) at strategic locations. Kata checks for project-local hook files at `.planning/hooks/{skill-name}/{hook-name}.md` before/after key steps. Hook files are markdown prompt fragments that Claude inlines during execution.

**Example:** A Python project creates `.planning/hooks/kata-execute-phase/post-task.md` containing: "After each task, run `pytest --tb=short` and fail the task if any tests break." Another project creates `.planning/hooks/kata-complete-milestone/pre-release.md` with: "Before version bump, regenerate API docs with `make docs` and stage the output."

**Why:** Surgical customization without replacing entire skills. Users write small prompt fragments rather than understanding full skill structure. Hook points create a stable API surface that Kata can maintain across versions.

**Scope:** Medium. Define hook points in ~8 core skills, build the hook resolution logic (check for file, inline if found), document the hook interface.

**Risks:**
- Hook point proliferation: too many hooks = complex debugging, unclear execution order.
- Prompt injection surface: hook files are arbitrary prompts inlined into a skill's context window.
- Hard to test: no way to validate that a hook file produces correct behavior without running the full workflow.
- Context budget: each hook file consumes tokens from the skill's context budget.

---

## Idea 3: Template Override Directory

**What:** Kata checks for project-local templates at `.planning/templates/` before falling back to plugin defaults. Skills that generate output (SUMMARY.md, PLAN.md, CHANGELOG entries) look for `{template-name}.md` in the project directory first.

**Example:** A team that uses Keep a Changelog format creates `.planning/templates/changelog-entry.md` with their format. Kata's `kata-complete-milestone` skill reads this template instead of its built-in changelog generator reference. Another project overrides `summary-template.md` to add a "Deployment Notes" section to every phase summary.

**Why:** Templates are the most common customization target. Output format preferences vary by team, project type, and organizational standards. Template overrides are low-risk (they affect output shape, not workflow logic) and easy to understand.

**Scope:** Small-Medium. Add template resolution logic (check project dir, fall back to plugin default). Catalog which templates are overridable. Document the template override pattern.

**Risks:**
- Template drift: overridden templates miss new fields added in plugin updates.
- Unclear which templates are overridable vs which are internal implementation details.
- No validation that overridden templates include required fields/sections.
- Template naming must be stable across versions (becomes a public API).

---

## Idea 4: Project Profiles (Preset Configuration Bundles)

**What:** Kata ships built-in profiles for common project types (e.g., `api-service`, `mobile-app`, `monorepo`, `library`). Each profile is a bundle of config values, default hook files, and template overrides. Users select a profile during `/kata-new-project` or via config. Projects can also define custom profiles in `.planning/profile.json`.

**Example:** Selecting `mobile-app` profile sets: verification includes "build iOS/Android," release workflow includes "bump build number," summary template includes "Platform Compatibility" section. The `monorepo` profile sets: phase scope limited to single package, verification runs per-package tests, summary includes "Affected Packages" section.

**Why:** Most projects fit a small number of archetypes. Profiles encode best practices per archetype without requiring users to configure each aspect individually. Profiles compose naturally with other extension mechanisms (a profile can set hooks + templates + config).

**Scope:** Medium-Large. Define 4-5 profiles, build the profile resolution system, integrate with `/kata-new-project` and `/kata-configure-settings`, test each profile against real workflows.

**Risks:**
- Profile maintenance burden: each profile multiplies testing surface.
- Projects rarely fit cleanly into one archetype. Hybrid projects need escape hatches.
- Profile changes across Kata versions could break project expectations.
- Profiles might become a crutch that discourages understanding the underlying config.

---

## Idea 5: Composable Skill Fragments

**What:** Break skill behavior into small, named fragments stored in a shared library (`skills/_fragments/` or `references/_shared/`). Skills compose themselves from fragments at execution time. Projects can override individual fragments without replacing entire skills. A fragment is a self-contained prompt section with a stable name and interface.

**Example:** The "git commit" behavior used by multiple skills (execute-phase, complete-milestone, execute-quick-task) is a fragment called `git-commit-atomic.md`. A project that uses Conventional Commits with a specific scope format overrides this one fragment, and all skills that use git commits pick up the change. Another project overrides the `verification-runner.md` fragment to use their custom test harness.

**Why:** Addresses the root cause: skills share common behaviors, but there is no mechanism to customize shared behavior in one place. Fragments create a "standard library" of reusable prompt components. Override one fragment, affect all consumers.

**Scope:** Large. Refactor existing skills to extract shared behaviors into fragments, build fragment resolution (project override > plugin default), document fragment interfaces, ensure backwards compatibility.

**Risks:**
- Major refactoring of existing skills required.
- Fragment dependency graph could become complex (fragment A depends on fragment B).
- Naming fragments creates a large public API surface.
- Context cost: fragment composition means Claude reads more files per skill execution.

---

## Idea 6: Config-Driven Workflow Variants

**What:** Extend `config.json` with structured workflow customization sections. Instead of boolean toggles, config keys accept objects with step-level overrides. Skills read these config sections and adapt their behavior without any file-based override mechanism.

**Example:**
```json
{
  "workflows": {
    "execute-phase": {
      "post_task_verify": "pytest --tb=short",
      "commit_style": "conventional",
      "commit_scope_format": "{phase}-{plan}"
    },
    "complete-milestone": {
      "changelog_format": "keep-a-changelog",
      "version_files": ["package.json", "pyproject.toml"],
      "pre_release_commands": ["make docs", "make lint"]
    },
    "verify-work": {
      "extra_checks": ["npx expo build:ios --dry-run"]
    }
  }
}
```

Skills read their section from config and incorporate the values into their prompts. No hook files, no template overrides, no skill shadowing.

**Why:** Keeps everything in one file. Users already understand config.json. No new file conventions to learn. Type-safe (can validate config schema). Easy to diff, version, and share.

**Scope:** Medium. Extend config schema, update skills to read workflow sections, add validation, update `/kata-configure-settings` to manage new sections.

**Risks:**
- Config becomes unwieldy. JSON is not a great format for expressing complex workflow variants.
- Limited expressiveness: cannot capture arbitrary prompt instructions in a config key.
- Skills become more complex (more conditional paths based on config).
- Difficult to express "add a step" vs "replace a step" in JSON.
