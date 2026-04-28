# AGENTS.md

## Hard Rules

- **Never use `git push --no-verify` or `git commit --no-verify`.** Pre-push and pre-commit hooks are quality gates. If a gate fails, fix the underlying problem. Bypassing hooks is never acceptable — not to unblock a push, not to save time, not for any reason short of an explicit instruction from the user.
- **For Linear-backed Kata workflow discovery, enumerate with `kata_list_slices({ projectId, teamId, milestoneId })` / `kata_list_tasks({ sliceIssueId })`, then inspect a specific issue with `linear_get_issue(id)`.** Do not enumerate Kata slices with `linear_list_issues({ projectId })` — it can pull full issue bodies from every milestone and unexpectedly flood agent context.
- **For GitHub-backed Kata workflow discovery, trust the active milestone roadmap plus `KATA:GITHUB_ARTIFACT` markers — not bare `S01` / `T01` title matches.** Slice and task IDs repeat across milestones, so global title matching can attach the wrong historical work to the current plan.

## Git Workflow: Worktrees and Standby Branches

This repo uses git worktrees. Each worktree has a **standby branch** (e.g. `wt-cli-standby`) that tracks `main`. Because git does not allow the same branch to be checked out in multiple worktrees simultaneously, the standby branch acts as a `main` proxy for the worktree.

**Standby branches are not working branches.** Treat `wt-cli-standby` (and any `*-standby` branch) exactly like `main`:

- Never commit to a standby branch.
- At the start of any session, if `git branch --show-current` returns a standby branch, you are effectively on main. Create (or check out) the correct feature branch — `kata/M00X/S0X` — before doing any work.
- If `STATE.md` records a standby branch as the active slice branch, that is a mistake from a previous session. Correct it: create the proper `kata/M00X/S0X` branch from `origin/main` before proceeding.

## Project Management with Linear

- **Project:** Kata CLI
- **Project ID:** `c7e76979-df58-407a-bf64-09bfccfef9c4`
- **Project Slug ID:** `459f9835e809`
- **Project URL:** <https://linear.app/kata-sh/project/kata-cli-459f9835e809>
- **Team:** Kata-sh
- **Team ID:** `a47bcacd-54f3-4472-a4b4-d6933248b605`
- **Issue prefix:** `KAT`
- **Default new issue state:** Backlog
- **Backlog State ID:** `07123b71-708f-4232-b965-67c082e254e7`  

## Testing Policy

This project uses two test runners during an incremental migration from bun:test to Vitest.

### Runners

| Runner | File pattern | Command | Coverage |
|--------|-------------|---------|----------|
| Vitest | `*.vitest.test.ts` | `npx vitest run` | `npx vitest run --coverage` (v8 provider, `all: false`) |
| Bun | `*.test.ts` (excluding `*.vitest.test.ts`) | `bun test --path-ignore-patterns '**/*.vitest.test.ts' src/` | None (legacy, no reliable aggregate coverage) |

The combined `test` script runs both: `bun test --path-ignore-patterns '**/*.vitest.test.ts' src/ && npx vitest run --coverage`. The `--path-ignore-patterns` flag prevents bun from picking up `.vitest.test.ts` files (which use vitest-only APIs like `vi.mock` that bun doesn't understand). Turborepo's `test` task exercises both runners and enforces coverage thresholds.

### Migration Policy

**Vitest is the target runner. Bun tests are legacy.**

- **New test files** must use Vitest (`*.vitest.test.ts`, import from `vitest`).
- **Existing bun test files must be migrated to Vitest when their source code is touched.** If you modify a source file and a bun-runner test file covers it, migrate that test file to Vitest as part of the same change. "Touched" means substantive logic changes — not comment typos or auto-formatter passes.
- **Migration is mechanical:** rename `.test.ts` → `.vitest.test.ts`, replace `import { ... } from "node:test"` with `import { ... } from "vitest"`, replace `node:assert/strict` assertions with Vitest `expect()` API. Test logic rarely needs to change.
- If a bun test file covers multiple source files and only one was touched, migrate the entire test file anyway — the migration unit is the test file, not the source file.

### Coverage

**Enforced thresholds (CI gate):** Lines ≥55%, Branches ≥55%, Functions ≥55%.

These thresholds are configured in `vitest.config.ts` under `coverage.thresholds` and enforced on every `bun run test` invocation (which chains `npx vitest run --coverage`). Turborepo's `test` task runs this same script, so any PR that drops coverage below thresholds fails the CI `validate` job.

**Scope:** Coverage is measured over a scoped set of directly-tested source modules (listed in `coverage.include` in `vitest.config.ts`), not the entire `src/` tree. This prevents transitive imports from untested code dragging down the aggregate. As new Vitest tests are added, their source modules should be added to the `coverage.include` list.

**Local check:** Run `npx vitest run --coverage` to see current coverage with threshold pass/fail output. Threshold violations surface as non-zero exit code with explicit "Coverage threshold not met" messages.

- The bun runner has `--coverage` but does not produce reliable aggregate output for this codebase. Do not rely on it.

### Conventions

- Test files live next to the source they test (in `tests/` subdirectories within each extension).
- Use `describe`/`it`/`expect` from `vitest` — not `node:test` or `node:assert`.
- Bun runner stays in the `test` script until zero non-Vitest `.test.ts` files remain. At that point, drop bun from the test script entirely.

## Pi architecture

Use when:

- understanding how pi works end to end
- tracing subsystem relationships
- understanding sessions, compaction, models, tools, or prompt flow
- deciding how to embed pi in a branded app, custom CLI, desktop app, or web product

Read first:

- `docs/what-is-pi/01-what-pi-is.md`
- `docs/what-is-pi/04-the-architecture-how-everything-fits-together.md`
- `docs/what-is-pi/05-the-agent-loop-how-pi-thinks.md`

Read together when relevant:

- `docs/what-is-pi/06-tools-how-pi-acts-on-the-world.md`
- `docs/what-is-pi/07-sessions-memory-that-branches.md`
- `docs/what-is-pi/08-compaction-how-pi-manages-context-limits.md`
- `docs/what-is-pi/09-the-customization-stack.md`
- `docs/what-is-pi/10-providers-models-multi-model-by-default.md`
- `docs/what-is-pi/13-context-files-project-instructions.md`

Follow-up if needed:

- `docs/what-is-pi/03-the-four-modes-of-operation.md`
- `docs/what-is-pi/11-the-interactive-tui.md`
- `docs/what-is-pi/12-the-message-queue-talking-while-pi-thinks.md`
- `docs/what-is-pi/14-the-sdk-rpc-embedding-pi.md`
- `docs/what-is-pi/15-pi-packages-the-ecosystem.md`
- `docs/what-is-pi/16-why-pi-matters-what-makes-it-different.md`
- `docs/what-is-pi/17-file-reference-all-documentation.md`
- `docs/what-is-pi/18-quick-reference-commands-shortcuts.md`
- `docs/what-is-pi/19-building-branded-apps-on-top-of-pi.md`

## Context engineering, hooks, and context flow

Use when:

- understanding how user prompts flow through to the LLM
- working with before_agent_start, context, tool_call, tool_result, input hooks
- injecting, filtering, or transforming LLM context
- understanding message types and what the LLM actually sees
- coordinating multiple extensions
- building mode systems, presets, or context management extensions
- debugging why the LLM does or doesn't see certain information

Read first:

- `docs/context-and-hooks/01-the-context-pipeline.md`
- `docs/context-and-hooks/02-hook-reference.md`

Read together when relevant:

- `docs/context-and-hooks/03-context-injection-patterns.md`
- `docs/context-and-hooks/04-message-types-and-llm-visibility.md`
- `docs/context-and-hooks/05-inter-extension-communication.md`
- `docs/context-and-hooks/06-advanced-patterns-from-source.md`
- `docs/context-and-hooks/07-the-system-prompt-anatomy.md`

## Extension development

Use when:

- building or modifying extensions
- adding tools, commands, hooks, renderers, state, or packaging

Read first:

- `docs/extending-pi/01-what-are-extensions.md`
- `docs/extending-pi/02-architecture-mental-model.md`
- `docs/extending-pi/03-getting-started.md`

Read together when relevant:

- `docs/extending-pi/06-the-extension-lifecycle.md`
- `docs/extending-pi/07-events-the-nervous-system.md`
- `docs/extending-pi/08-extensioncontext-what-you-can-access.md`
- `docs/extending-pi/09-extensionapi-what-you-can-do.md`
- `docs/extending-pi/10-custom-tools-giving-the-llm-new-abilities.md`
- `docs/extending-pi/11-custom-commands-user-facing-actions.md`
- `docs/extending-pi/14-custom-rendering-controlling-what-the-user-sees.md`
- `docs/extending-pi/25-slash-command-subcommand-patterns.md` # for subcommand-style slash command UX via getArgumentCompletions()
- `docs/extending-pi/15-system-prompt-modification.md`
- `docs/extending-pi/22-key-rules-gotchas.md`

Follow-up if needed:

- `docs/extending-pi/04-extension-locations-discovery.md`
- `docs/extending-pi/05-extension-structure-styles.md`
- `docs/extending-pi/12-custom-ui-visual-components.md`
- `docs/extending-pi/13-state-management-persistence.md`
- `docs/extending-pi/16-compaction-session-control.md`
- `docs/extending-pi/17-model-provider-management.md`
- `docs/extending-pi/18-remote-execution-tool-overrides.md`
- `docs/extending-pi/19-packaging-distribution.md`
- `docs/extending-pi/20-mode-behavior.md`
- `docs/extending-pi/21-error-handling.md`
- `docs/extending-pi/23-file-reference-documentation.md`
- `docs/extending-pi/24-file-reference-example-extensions.md`

## Pi UI and TUI

Use when:

- building dialogs, widgets, overlays, custom editors, or UI renderers
- working on TUI layout or display behavior

Read first:

- `docs/pi-ui-tui/01-the-ui-architecture.md`
- `docs/pi-ui-tui/03-entry-points-how-ui-gets-on-screen.md`
- `docs/pi-ui-tui/22-quick-reference-all-ui-apis.md`

Read together when relevant:

- `docs/pi-ui-tui/04-built-in-dialog-methods.md`
- `docs/pi-ui-tui/05-persistent-ui-elements.md`
- `docs/pi-ui-tui/06-ctx-ui-custom-full-custom-components.md`
- `docs/pi-ui-tui/07-built-in-components-the-building-blocks.md`
- `docs/pi-ui-tui/12-overlays-floating-modals-and-panels.md`
- `docs/pi-ui-tui/13-custom-editors-replacing-the-input.md`
- `docs/pi-ui-tui/14-tool-rendering-custom-tool-display.md`
- `docs/pi-ui-tui/15-message-rendering-custom-message-display.md`
- `docs/pi-ui-tui/21-common-mistakes-and-how-to-avoid-them.md`

Follow-up if needed:

- `docs/pi-ui-tui/02-the-component-interface-foundation-of-everything.md`
- `docs/pi-ui-tui/08-high-level-components-from-pi-coding-agent.md`
- `docs/pi-ui-tui/09-keyboard-input-how-to-handle-keys.md`
- `docs/pi-ui-tui/10-line-width-the-cardinal-rule.md`
- `docs/pi-ui-tui/11-theming-colors-and-styles.md`
- `docs/pi-ui-tui/16-performance-caching-and-invalidation.md`
- `docs/pi-ui-tui/17-theme-changes-and-invalidation.md`
- `docs/pi-ui-tui/18-ime-support-the-focusable-interface.md`
- `docs/pi-ui-tui/19-building-a-complete-component-step-by-step.md`
- `docs/pi-ui-tui/20-real-world-patterns-from-examples.md`
- `docs/pi-ui-tui/23-file-reference-example-extensions-with-ui.md`

## Building coding agents

Use when:

- designing agent behavior
- improving autonomy, speed, context handling, or decomposition
- solving hard ambiguity, safety, or verification problems

Read first:

- `docs/building-coding-agents/01-work-decomposition.md`
- `docs/building-coding-agents/06-maximizing-agent-autonomy-superpowers.md`
- `docs/building-coding-agents/11-god-tier-context-engineering.md`
- `docs/building-coding-agents/12-handling-ambiguity-contradiction.md`
- `docs/building-coding-agents/26-cross-cutting-themes-where-all-4-models-converge.md`

Read together when relevant:

- `docs/building-coding-agents/03-state-machine-context-management.md`
- `docs/building-coding-agents/04-optimal-storage-for-project-context.md`
- `docs/building-coding-agents/05-parallelization-strategy.md`
- `docs/building-coding-agents/07-system-prompt-llm-vs-deterministic-split.md`
- `docs/building-coding-agents/08-speed-optimization.md`
- `docs/building-coding-agents/10-top-10-pitfalls-to-avoid.md`
- `docs/building-coding-agents/17-irreversible-operations-safety-architecture.md`
- `docs/building-coding-agents/20-error-taxonomy-routing.md`
- `docs/building-coding-agents/24-security-trust-boundaries.md`

Follow-up if needed:

- `docs/building-coding-agents/02-what-to-keep-discard-from-human-engineering.md`
- `docs/building-coding-agents/09-top-10-tips-for-a-world-class-agent.md`
- `docs/building-coding-agents/13-long-running-memory-fidelity.md`
- `docs/building-coding-agents/14-multi-agent-semantic-conflict-resolution.md`
- `docs/building-coding-agents/15-legacy-code-brownfield-onboarding.md`
- `docs/building-coding-agents/16-encoding-taste-aesthetics.md`
- `docs/building-coding-agents/18-the-handoff-problem-agent-human-maintainability.md`
- `docs/building-coding-agents/19-when-to-scrap-and-start-over.md`
- `docs/building-coding-agents/21-cost-quality-tradeoff-model-routing.md`
- `docs/building-coding-agents/22-cross-project-learning-reusable-intelligence.md`
- `docs/building-coding-agents/23-evolution-across-project-scale.md`
- `docs/building-coding-agents/25-designing-for-non-technical-users-vibe-coders.md`

## Pi product docs

Use when:

- the user asks about pi itself, its SDK, extensions, themes, skills, packages, TUI, prompt templates, keybindings, or custom providers

Read first:

- `~dev/kata/pi-mono/packages/coding-agent/README.md`

Read together when relevant:

- `~dev/kata/pi-mono/packages/coding-agent/docs/compaction.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/custom-provider.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/development.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/extensions.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/json.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/keybindings.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/models.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/packages.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/prompt-templates.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/providers.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/rpc.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/sdk.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/session.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/settings.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/shell-aliases.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/skills.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/terminal-setup.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/termux.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/themes.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/tmux.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/tree.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/tui.md`
- `~dev/kata/pi-mono/packages/coding-agent/docs/windows.md`

Follow-up if needed:

- `~dev/kata/pi-mono/packages/coding-agent/examples/README.md`
