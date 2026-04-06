# kata-mono

Bun monorepo (bun 1.3.8) with Turborepo orchestration. Rust app (Symphony) included.

## App Context

This mono-repo is comprised of the following primary applications:

- Kata Symphony: `apps/symphony` - @kata/symphony — Rust binary (Cargo scripts via package.json)
- Kata CLI: `apps/cli` - @kata-sh/cli — published NPM CLI agent
- Kata Desktop: `apps/desktop` - Electron app (primary UI)
- Legacy Desktop: `apps/electron` - deprecated, replaced by `apps/desktop`
- Context Indexer: `apps/context` - @kata/context — context indexing tool (Vitest, native Node addon)
- Orchestrator: `apps/orchestrator` - @kata-sh/orc — meta-prompting system

## Commands

```bash
bun install                      # Install all workspace dependencies
bun run validate                 # Lint + typecheck + test (all packages, via Turborepo)
bun run validate:affected        # Same but only changed packages
bun run lint                     # ESLint across all packages
bun run typecheck                # TypeScript across all packages
bun run test                     # Test runner across all packages
bun run test:affected            # Only changed packages
bun run test:watch               # Watch mode
bun run test:coverage            # Coverage report
cd apps/desktop && bun run dev:renderer  # Desktop renderer dev mode
cd apps/desktop && bun run build         # Build Desktop main + preload + renderer
cd apps/desktop && bun run test:e2e      # Desktop Playwright E2E
bun run print:system-prompt      # Debug: print the agent system prompt
```

## Structure

```
apps/
├── cli/              # @kata-sh/cli — published NPM CLI agent
├── context/          # @kata/context — context indexing tool (Vitest, native Node addon)
├── desktop/          # Kata Desktop — Electron app (primary UI, current)
├── electron/         # Legacy Desktop (deprecated, Craft Agents era)
├── orchestrator/     # @kata-sh/orc — meta-prompting system
├── symphony/         # @kata/symphony — Rust binary (Cargo scripts via package.json)
├── viewer/           # Session viewer (Vite)
└── online-docs/      # @kata/online-docs — documentation site (Fumadocs/Next.js)

packages/
├── core/             # @craft-agent/core — shared TypeScript types
├── shared/           # @craft-agent/shared — business logic (agent, auth, config, MCP, channels, daemon)
├── ui/               # @craft-agent/ui — shared React components (chat, markdown)
└── mermaid/          # Mermaid diagram → SVG renderer
```

Workspace exclusion in `package.json`: `apps/online-docs`.

## Turborepo

Tasks defined in `turbo.json`: `lint`, `typecheck` (topological), `test`, `build` (topological), `dev` (no cache).

```bash
turbo run typecheck --affected    # Only changed packages
turbo run lint typecheck test     # Full validation pipeline
```

Inputs include `.ts`, `.tsx`, `.js`, `.cjs`, `.mjs`, `.rs`, and `Cargo.toml` so both JS/TS and Rust changes invalidate the cache correctly.

## Testing

Turborepo orchestrates all test runners via `turbo run test`. Each package owns its runner:

| Package    | Runner     | Why                                                            |
| ---------- | ---------- | -------------------------------------------------------------- |
| context    | Vitest     | Uses better-sqlite3 (native Node addon, incompatible with Bun) |
| symphony   | cargo test | Rust binary, runs through package.json shim                    |
| all others | Bun test   | Default for JS/TS packages                                     |

Pre-push hook runs `turbo run lint typecheck test --affected` — same command as CI.

## CI

`ci.yml` on pull_request to main:

- `validate`: `turbo run lint typecheck test --affected` (JS/TS + Rust via Turborepo)
- `e2e-mocked`: (legacy, removed) — Desktop E2E now lives in `apps/desktop`
- `gate`: aggregates results, sole required branch protection check

Release workflows trigger on push to main with path filters:
`cli-release.yml`, `desktop-release.yml`, `orc-release.yml`, `context-release.yml`, `symphony-release.yml`

## Tech Stack

- **Runtime:** Bun (scripts, tests, subprocess execution)
- **Desktop:** Electron (main process = Node.js)
- **UI:** React 18 + Vite + Tailwind CSS v4 + Radix UI
- **State:** Jotai atoms
- **AI:** @anthropic-ai/claude-agent-sdk + @anthropic-ai/sdk + @modelcontextprotocol/sdk
- **Build:** esbuild (main/preload) + Vite (renderer) + Turborepo (orchestration)
- **Rust:** Cargo (Symphony)

## Hard Rules

- Never use `git push --no-verify` or `git commit --no-verify`. If the gate fails, fix the problem.
- `git push --force` to main/master is forbidden.

## Git Workflow

This repo uses git worktrees. Each worktree has a standby branch (e.g. `wt-cli-standby`) that tracks `main`. Standby branches are not working branches. Never commit to them.

## Gotchas

- `CLAUDE.md` files in this repo are symlinks to `AGENTS.md`. Always edit `AGENTS.md`.
- `apps/online-docs` uses Fumadocs/Next.js. Run `bun run docs:dev` from the repo root to start it on port 3001.
- `apps/context` uses Vitest (not Bun test) because better-sqlite3 is a native Node addon that Bun doesn't support.
- Electron main process runs in Node.js, not Bun. Don't use `import.meta.dir` or Bun-only APIs in code that runs there.
- Asset paths: use `getBundledAssetsDir(subfolder)` for bundled assets, never `import.meta.dir`.
- Legacy debug logs: `~/Library/Logs/@craft-agent/electron/` on macOS (legacy app only).
- Desktop debug logs: check Electron main process console or `apps/desktop/src/main/logger.ts`.
