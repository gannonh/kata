# Kata Monorepo Migration Plan

## Current State

### GitHub Repos

| GitHub repo         | Stars | Forks | Status                                   | What it is                                          |
| ------------------- | ----- | ----- | ---------------------------------------- | --------------------------------------------------- |
| `kata`              | 0     | 0     | **Active** — monorepo                    | Desktop + CLI apps, shared packages                 |
| `kata-orchestrator` | 105   | 3     | **Active** — extract then archive        | Agent skills for dev workflow orchestration         |
| `kata-symphony`     | 0     | 0     | **Active** — import then archive         | Linear board monitor, autonomous agent spawner      |
| `kata-marketplace`  | 1     | 0     | **Active** — dist for Claude Code plugin | Claude Code plugin distribution (from orchestrator) |
| `kata-skills`       | 1     | 0     | **Active** — dist for skills.sh          | Skills package distribution                         |
| `kata-site`         | 0     | 0     | **Active** — keep independent            | Marketing site (Astro, Vercel deploy)               |
| `kata-context`      | 1     | 0     | **Abandoned** — restart in monorepo      | Context system (will be rebuilt)                    |
| `kata-shadcn`       | 1     | 0     | Ignore                                   | Not part of migration                               |
| `kata-tui`          | 0     | 0     | Ignore                                   | Not part of migration                               |

### Local directories

| Local path                             | Maps to GitHub repo                                       |
| -------------------------------------- | --------------------------------------------------------- |
| `/Volumes/EVO/kata/kata-mono/`         | `gannonh/kata`                                            |
| `/Volumes/EVO/kata/kata-orchestrator/` | `gannonh/kata-orchestrator`                               |
| `/Volumes/EVO/kata/kata-symphony/`     | `gannonh/kata-symphony`                                   |
| `/Volumes/EVO/kata/kata-site/`         | `gannonh/kata-site`                                       |
| `/Volumes/EVO/kata/GSD-Pi/`            | Reference implementation for CLI (not our repo)           |
| `/Volumes/EVO/kata/pi-mono/`           | Upstream pi packages (not our repo, consumed as npm deps) |

---

## Migration Progress

### Phase 1: Monorepo Foundation ✅ COMPLETE

- [x] GitHub repo renamed: `gannonh/kata-cloud-agents` → `gannonh/kata`
- [x] Git remote updated to `git@github.com:gannonh/kata.git`
- [x] Root `package.json`: name → `"kata"`, description → `"Kata monorepo"`
- [x] Root `package.json` version set to `0.0.0` (not used for releases)
- [x] Obsolete repos deleted: `kata-agents`, `kata-cloud`
- [x] Root README rewritten as monorepo index
- [x] Desktop README moved to `apps/electron/README.md`, rebranded "Kata Desktop"
- [x] Desktop AGENTS.md moved to `apps/electron/AGENTS.md`
- [x] `apps/electron/package.json`: name → `@kata-sh-sh/desktop`, homepage → `gannonh/kata`
- [x] `electron-builder.yml`: productName → "Kata Desktop", artifacts → `Kata-Desktop-*`

### Phase 2: Add the CLI ✅ COMPLETE

- [x] GSD-Pi copied into `apps/cli/` with full source
- [x] `package.json`: name → `@kata-sh-sh/cli`, bin → `kata-cli`, piConfig → `".kata-cli"`
- [x] Full GSD → Kata rebrand across all files:
  - [x] Env vars: `GSD_*` → `KATA_*`
  - [x] Types/classes: `GSDState` → `KataState`, `GSDPreferences` → `KataPreferences`, etc.
  - [x] Functions: `gsdRoot()` → `kataRoot()`, `resolveGsdRootFile()` → `resolveKataRootFile()`, etc.
  - [x] User-facing strings: `/gsd` → `/kata`, "GSD" → "Kata", "Get Stuff Done" → "Kata Workflow"
  - [x] Branch prefix: `gsd/` → `kata/`
  - [x] Widget/custom type IDs: `gsd-auto` → `kata-auto`, etc.
  - [x] File rename: `GSD-WORKFLOW.md` → `KATA-WORKFLOW.md`
  - [x] Extension directory: `extensions/gsd/` → `extensions/kata/`
  - [x] Slash command: `gsd-run.ts` → `kata-run.ts`
  - [x] All prompts, templates, docs, tests, scripts
  - [x] Zero GSD/gsd references remaining (text, file names, folder names)
- [x] Config directory: `~/.kata-cli/` (avoids collision with desktop's `~/.kata/`)
- [x] `AGENTS.md` created in `src/resources/` (synced to agent dir, injected into system prompt)
- [x] `README.md` written for CLI
- [x] Dead import removed (`recordUnitProgress` — pre-existing upstream bug)
- [x] Global preferences path fixed (`~/.kata/` → `~/.kata-cli/`)
- [x] All 32 tests passing
- [x] TypeScript compiles cleanly

### Release Infrastructure ✅ COMPLETE

- [x] `release.yml` → `desktop-release.yml` (desktop only)
- [x] `cli-release.yml` created (npm publish workflow)
- [x] Independent versioning: each app owns its own version
  - Desktop: `apps/electron/package.json`, tags as `desktop-v*`
  - CLI: `apps/cli/package.json`, tags as `cli-v*`
  - Root: `0.0.0` (not used for releases)
- [x] Releasing skill updated to cover both targets
- [x] `.gitignore` updated (`.superpowers/`)

### Phase 3: Import Kata Orchestrator — NOT STARTED

- [ ] Wait for Orchestrator 2.0 release (cursor, plugin support, etc.) for cleaner import
- [ ] Integrate orchestrator release workflows in CI (migrate from orchestrator repo and adapt)
- [ ] Archive `kata-orchestrator`

### Phase 4: Import Symphony — NOT STARTED

- [ ] Create `packages/symphony-core/` + `apps/symphony/`
- [ ] Adapt from pnpm/vitest to bun workspace
- [ ] Archive `kata-symphony`

### Phase 5: Swap Agent Engine — NOT STARTED (Future)

- [ ] Replace `@anthropic-ai/claude-agent-sdk` with `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`
- [ ] Multi-provider support across all apps

### Other Deferred Work

- [ ] Rename `@craft-agent/*` packages to `@kata-sh/*` (core, shared, ui)
- [ ] Rename `apps/electron/` → `apps/desktop/` (directory name)
- [ ] `apps/cloud/` — containerized cloud agents
- [ ] `kata-site` import (Vercel pipeline makes it complex)
- [ ] `kata-context` restart as `packages/context/`

---

## Target State

```
kata/
├── packages/
│   ├── core/                  ← exists (shared types)
│   ├── shared/                ← exists (auth, config, sessions, sources, MCP)
│   ├── ui/                    ← exists (React components)
│   ├── mermaid/               ← exists (Mermaid rendering)
│   ├── skills/                ← Phase 3: from kata-orchestrator
│   └── context/               ← future: rebuilt context system
│
├── apps/
│   ├── cli/                   ← ✅ Phase 2: pi-coding-agent wrapper
│   ├── electron/              ← exists (desktop app)
│   ├── symphony/              ← Phase 4: from kata-symphony
│   ├── viewer/                ← exists (session viewer)
│   └── online-docs/           ← exists (docs site)
```

Independent repos:

- `kata-marketplace` — Claude Code plugin distribution
- `kata-skills` — skills.sh package distribution
- `kata-site` — Marketing site (Vercel)

---

## Repo Disposition Summary

| GitHub repo         | Action                                             | Status  |
| ------------------- | -------------------------------------------------- | ------- |
| `kata-cloud-agents` | Renamed → `kata`                                   | ✅ Done  |
| `kata-agents`       | Deleted                                            | ✅ Done  |
| `kata-cloud`        | Deleted                                            | ✅ Done  |
| `kata-orchestrator` | Import → archive                                   | Phase 3 |
| `kata-symphony`     | Import → archive                                   | Phase 4 |
| `kata-marketplace`  | Keep independent (dist repo, builds from monorepo) | Ongoing |
| `kata-skills`       | Keep independent (dist repo, builds from monorepo) | Ongoing |
| `kata-site`         | Keep independent (Vercel deploy)                   | Ongoing |
| `kata-context`      | Restart as `packages/context/` in monorepo         | Future  |
| `kata-shadcn`       | Ignore                                             | —       |
| `kata-tui`          | Ignore                                             | —       |

---

## Decision Log

| Decision                | Choice                                            | Rationale                                                              |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Monorepo base           | kata-cloud-agents                                 | Already has packages/, apps/, bun workspaces, most active codebase     |
| Monorepo name           | `gannonh/kata`                                    | Strongest brand; name is available                                     |
| CLI approach            | Consume pi-coding-agent as npm dep (GSD pattern)  | Upstream parity, no fork maintenance                                   |
| CLI starting point      | Copy GSD-Pi, rebrand                              | Faster than writing from scratch; proven pattern                       |
| CLI config dir          | `.kata-cli` (not `.kata`)                         | Avoids collision with desktop app's `~/.kata-agents/`                  |
| Distribution repos      | kata-marketplace and kata-skills stay independent | They're dist targets for different ecosystems (Claude Code, skills.sh) |
| Site migration          | Deferred (keep independent)                       | Vercel deploy pipeline; no code sharing benefit                        |
| Old repo handling       | Delete obsolete, archive after extraction         | Stars/forks preserved on archive; clean break for obsolete             |
| Agent engine swap       | Deferred to Phase 5                               | Get monorepo structure right first; engine swap is high-risk           |
| Git history for imports | Clean copy, not subtree                           | Simpler; low-star repos don't need preserved history                   |
| Versioning              | Independent per app                               | Desktop `desktop-v*`, CLI `cli-v*`; root version unused                |
| `@craft-agent/*` rename | Deferred                                          | Broad impact across electron app; not blocking                         |
| `apps/electron/` rename | Deferred                                          | Would break CI, build scripts; cosmetic                                |
