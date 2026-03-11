# Kata CLI — Agent Instructions

You are working inside Kata CLI, a coding agent built on the pi SDK (`@mariozechner/pi-coding-agent`).

## Architecture

Kata CLI is a thin wrapper around pi-coding-agent that provides:

- **Branded entry point**: `src/loader.ts` sets env vars and launches `src/cli.ts`
- **Bundled extensions**: `src/resources/extensions/` contains all built-in extensions
- **Resource syncing**: `src/resource-loader.ts` copies bundled extensions to `~/.kata-cli/agent/` on startup
- **Config directory**: `~/.kata-cli/` (not `~/.kata/` to avoid collision with other Kata apps)
- **Package shim**: `pkg/package.json` provides `piConfig` with `name: "kata"` and `configDir: ".kata-cli"`

## Directory Structure

```
apps/cli/
  src/
    loader.ts              — Entry point, sets KATA_* env vars, imports cli.ts
    cli.ts                 — Thin wrapper that calls pi-coding-agent's main()
    app-paths.ts           — Exports appRoot, agentDir, sessionsDir, authFilePath
    resource-loader.ts     — Syncs bundled resources to ~/.kata-cli/agent/
    wizard.ts              — First-run setup, env key hydration
    resources/
      KATA-WORKFLOW.md     — The Kata planning methodology document
      AGENTS.md            — This file (synced to ~/.kata-cli/agent/AGENTS.md)
      agents/              — Agent prompt templates (worker, scout, researcher)
      extensions/
        kata/              — Main extension: /kata command, auto-mode, planning, state
        browser-tools/     — Playwright-based browser automation
        subagent/          — Spawns child kata processes for parallel work
        slash-commands/     — /kata-run and other slash commands
        shared/            — Shared UI components used by multiple extensions
        bg-shell/          — Background shell execution
        context7/          — Context7 library documentation lookup
        search-the-web/    — Web search via Brave API
        mac-tools/         — macOS-specific utilities
      skills/              — Bundled skills
  pkg/
    package.json           — piConfig shim (name: "kata", configDir: ".kata-cli")
    dist/                  — Theme assets copied from pi-coding-agent
  dist/                    — TypeScript compilation output
```

## Environment Variables

Kata sets these env vars in `loader.ts` before importing `cli.ts`:

| Variable | Purpose |
|----------|---------|
| `PI_PACKAGE_DIR` | Points to `pkg/` so pi reads Kata's piConfig |
| `KATA_CODING_AGENT_DIR` | Tells pi's `getAgentDir()` to return `~/.kata-cli/agent/` |
| `KATA_VERSION` | Package version for display |
| `KATA_BIN_PATH` | Absolute path to loader, used by subagent to spawn Kata |
| `KATA_WORKFLOW_PATH` | Absolute path to bundled KATA-WORKFLOW.md |
| `KATA_BUNDLED_EXTENSION_PATHS` | Colon-joined list of extension entry points |

## The /kata Command

The main extension registers the `/kata` slash command with subcommands:

- `/kata` — Contextual wizard (smart entry point based on project state)
- `/kata auto` — Start auto-mode (loops fresh sessions until milestone complete)
- `/kata stop` — Stop auto-mode gracefully
- `/kata status` — Progress dashboard
- `/kata queue` — View/manage work queue
- `/kata discuss` — Discuss gray areas before planning
- `/kata prefs [global|project|status]` — Manage preferences
- `/kata doctor [audit|fix|heal]` — Diagnose and fix project state

## Project State

Kata stores project state in `.kata/` at the project root:

```
.kata/
  STATE.md              — Dashboard (read first)
  DECISIONS.md          — Append-only decisions register
  PROJECT.md            — Project description
  REQUIREMENTS.md       — Requirements tracking
  milestones/
    M001/
      M001-ROADMAP.md   — Milestone plan with slices
      M001-SUMMARY.md   — Milestone rollup
      slices/
        S01/
          S01-PLAN.md    — Task decomposition
          S01-SUMMARY.md — Slice summary
          tasks/
            T01-PLAN.md
            T01-SUMMARY.md
```

## Development

- **Build**: `npx tsc` (TypeScript compilation)
- **Test**: `node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/kata/tests/*.test.ts' 'src/tests/*.test.ts'`
- **Copy themes**: `npm run copy-themes` (copies theme assets from pi-coding-agent)
- **Dependencies**: Consumed via npm from `@mariozechner/pi-coding-agent` — never fork

## Key Conventions

- All env var names use `KATA_` prefix (not `GSD_` or `PI_`)
- Config directory is `.kata-cli` (the `-cli` suffix avoids collision)
- Extensions are synced from `src/resources/extensions/` to `~/.kata-cli/agent/extensions/` on every launch
- The `shared/` extension directory is a library, not an entry point — it's imported by other extensions
- Branch naming for workflow: `kata/M001/S01` (milestone/slice)
