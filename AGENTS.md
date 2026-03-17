# kata-mono

Bun monorepo (bun 1.3.8) with Turborepo orchestration.

## Commands

```bash
bun install                      # Install all workspace dependencies
bun run validate                 # Lint + typecheck + test (all packages, via Turborepo)
bun run validate:affected        # Same but only changed packages
bun run lint                     # ESLint across all packages
bun run typecheck                # TypeScript across all packages
bun run test                     # Bun test runner across all packages
bun run test:watch               # Watch mode (packages + electron src)
bun run test:coverage            # Coverage report
bun run test:e2e                 # Mocked Electron Playwright e2e
bun run test:e2e:live            # Live e2e (real credentials, local-only)
bun run electron:dev             # Dev with hot reload
bun run electron:build           # Build main + preload + renderer + resources + assets
bun run electron:start           # Build then launch
bun run electron:dist:mac        # macOS DMG
bun run print:system-prompt      # Debug: print the agent system prompt
```

## Structure

```
apps/
├── cli/              # @kata-sh/cli — published NPM CLI agent
├── context/          # @kata-sh/context — context server
├── electron/         # Kata Desktop — Electron app (primary UI)
├── orchestrator/     # Orchestrator service
├── symphony/         # Symphony-Rust — Rust port of Elixir orchestrator
├── viewer/           # Session viewer (Vite)
└── online-docs/      # Mintlify docs (excluded from workspaces)

packages/
├── core/             # @craft-agent/core — shared TypeScript types
├── shared/           # @craft-agent/shared — business logic (agent, auth, config, MCP, channels, daemon)
├── ui/               # @craft-agent/ui — shared React components (chat, markdown)
└── mermaid/          # Mermaid diagram → SVG renderer
```

Workspace exclusions in `package.json`: `apps/online-docs`, `apps/symphony`.

## Turborepo

Tasks defined in `turbo.json`: `lint`, `typecheck` (topological), `test`, `build` (topological), `dev` (no cache).

```bash
turbo run typecheck --affected    # Only changed packages
turbo run lint typecheck test     # Full validation pipeline
```

## Tech Stack

- **Runtime:** Bun (scripts, tests, subprocess execution)
- **Desktop:** Electron (main process = Node.js)
- **UI:** React 18 + Vite + Tailwind CSS v4 + Radix UI
- **State:** Jotai atoms
- **AI:** @anthropic-ai/claude-agent-sdk + @anthropic-ai/sdk + @modelcontextprotocol/sdk
- **Build:** esbuild (main/preload) + Vite (renderer) + Turborepo (orchestration)

## Hard Rules

- Never use `git push --no-verify` or `git commit --no-verify`. If the gate fails, fix the problem.
- `git push --force` to main/master is forbidden.

## Git Workflow

This repo uses git worktrees. Each worktree has a standby branch (e.g. `wt-cli-standby`) that tracks `main`. Standby branches are not working branches. Never commit to them.

## Gotchas

- `apps/online-docs` and `apps/symphony` are excluded from Bun workspaces. They have separate dependency management.
- Electron main process runs in Node.js, not Bun. Don't use `import.meta.dir` or Bun-only APIs in code that runs there.
- Asset paths: use `getBundledAssetsDir(subfolder)` for bundled assets, never `import.meta.dir`.
- Debug logs: `~/Library/Logs/@craft-agent/electron/` on macOS.
