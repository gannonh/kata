# kata-mono

pnpm monorepo (`pnpm@10.6.2`) with Turborepo orchestration. Rust app (Symphony) included.

## App Context

This mono-repo is comprised of the following primary applications:

- Kata Symphony: `apps/symphony` - @kata/symphony — Rust binary (Cargo scripts via package.json)
- Kata CLI: `apps/cli` - @kata-sh/cli — portable Kata Skills runtime and backend contract bridge
- Kata Desktop: `apps/desktop` - Electron app (primary UI)
- Context Indexer: `apps/context` - @kata/context — context indexing tool (Vitest, native Node addon)
- Orchestrator Legacy: `apps/orchestrator-legacy` - archived reference only, excluded from the active workspace

## Commands

```bash
pnpm install                     # Install all workspace dependencies
pnpm run validate                # Lint + typecheck + test (all packages, via Turborepo)
pnpm run validate:affected       # Same but only changed packages
pnpm run lint                    # ESLint across all packages
pnpm run typecheck               # TypeScript across all packages
pnpm run test                    # Test runner across all packages
pnpm run test:watch              # Watch mode
pnpm run test:coverage           # Coverage summary
pnpm run desktop:dev             # Desktop full dev mode from repo root
pnpm run desktop:build           # Build Desktop main + preload + renderer
pnpm run test:e2e                # Desktop Playwright E2E
pnpm run print:system-prompt     # Debug: print the agent system prompt
```

## Structure

```
apps/
├── cli/              # @kata-sh/cli — Kata Skills runtime and backend contract bridge
├── cli/skills-src/   # Source of truth for Kata Agent Skills
├── context/          # @kata/context — context indexing tool (Vitest, native Node addon)
├── desktop/          # Kata Desktop — Electron app (primary UI)
├── orchestrator-legacy/ # Archived legacy Orchestrator reference
├── symphony/         # @kata/symphony — Rust binary (Cargo scripts via package.json)
├── viewer/           # Session viewer (Vite)
└── online-docs/      # @kata/online-docs — documentation site (Fumadocs/Next.js)

packages/
├── core/             # Shared TypeScript types
├── shared/           # Shared business logic (agent, auth, config, MCP, channels, daemon)
├── ui/               # Shared React components (chat, markdown)
└── mermaid/          # Mermaid diagram → SVG renderer
```

Workspace exclusions in `pnpm-workspace.yaml`: `apps/cli-legacy`, `apps/orchestrator-legacy`, and `apps/online-docs`.

## Turborepo

Tasks defined in `turbo.json`: `lint`, `typecheck` (topological), `test`, `build` (topological), `dev` (no cache).

```bash
turbo run typecheck --affected    # Only changed packages
turbo run lint typecheck test     # Full validation pipeline
```

Inputs include `.ts`, `.tsx`, `.js`, `.cjs`, `.mjs`, `.rs`, and `Cargo.toml` so both JS/TS and Rust changes invalidate the cache correctly.

## Testing

Turborepo orchestrates package-local test scripts via `turbo run test`.

| Package  | Runner / command | Notes |
| -------- | ---------------- | ----- |
| cli      | `pnpm test`      | Vitest suite for CLI domain, backend adapters, skill bundle, and golden-path contract |
| desktop  | `pnpm run test`  | Vitest with coverage; Playwright lives under `pnpm run test:e2e` |
| context  | Vitest           | Uses better-sqlite3 (native Node addon; Node runtime required) |
| symphony | `cargo test`     | Rust binary |
| shared   | Vitest           | Package-local `vitest run` |

Pre-push hook runs `pnpm exec turbo run lint typecheck test --affected` — same command as CI.

## CI

`ci.yml` on pull_request to main:

- `validate`: `turbo run lint typecheck test --affected` (JS/TS + Rust via Turborepo)
- `e2e`: Desktop Playwright E2E in `apps/desktop`
- `gate`: aggregates results, sole required branch protection check

Release workflows trigger on push to main with path filters:
`cli-release.yml`, `desktop-release.yml`, `context-release.yml`, `symphony-release.yml`

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
- `apps/online-docs` uses Fumadocs/Next.js. Run `pnpm run docs:dev` from the repo root to start it on port 3001.
- `apps/context` uses Vitest (not Bun test) because better-sqlite3 is a native Node addon that Bun doesn't support.
- Electron main process runs in Node.js, not Bun. Don't use `import.meta.dir` or Bun-only APIs in code that runs there.
- Asset paths: use `getBundledAssetsDir(subfolder)` for bundled assets, never `import.meta.dir`.
- Desktop debug logs: check Electron main process console or `apps/desktop/src/main/logger.ts`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `gannonh/kata`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Domain docs use a single-context layout. See `docs/agents/domain.md`.
