# Kata Monorepo Migration Plan

## Current State

### GitHub Repos

| GitHub repo         | Stars | Forks | Status                                   | What it is                                          |
| ------------------- | ----- | ----- | ---------------------------------------- | --------------------------------------------------- |
| `kata-cloud-agents` | 0     | 0     | **Active** — monorepo base               | Desktop app (Electron, Claude SDK)                  |
| `kata-orchestrator` | 105   | 3     | **Active** — extract then archive        | Agent skills for dev workflow orchestration         |
| `kata-symphony`     | 0     | 0     | **Active** — import then archive         | Linear board monitor, autonomous agent spawner      |
| `kata-marketplace`  | 1     | 0     | **Active** — dist for Claude Code plugin | Claude Code plugin distribution (from orchestrator) |
| `kata-skills`       | 1     | 0     | **Active** — dist for skills.sh          | Skills package distribution                         |
| `kata-site`         | 0     | 0     | **Active** — import to monorepo          | Marketing site (Astro)                              |
| `kata-context`      | 1     | 0     | **Abandoned** — restart in monorepo      | Context system (will be rebuilt)                    |
| `kata-agents`       | 3     | 0     | **Obsolete** — delete                    | Old version of kata-cloud-agents                    |
| `kata-cloud`        | 0     | 0     | **Obsolete** — delete                    | Obsolete                                            |
| `kata-shadcn`       | 1     | 0     | Ignore                                   | Not part of migration                               |
| `kata-tui`          | 0     | 0     | Ignore                                   | Not part of migration                               |

### Local directories

| Local path                             | Maps to GitHub repo                                       |
| -------------------------------------- | --------------------------------------------------------- |
| `/Volumes/EVO/kata/kata-cloud-agents/` | `gannonh/kata-cloud-agents`                               |
| `/Volumes/EVO/kata/kata-orchestrator/` | `gannonh/kata-orchestrator`                               |
| `/Volumes/EVO/kata/kata-symphony/`     | `gannonh/kata-symphony`                                   |
| `/Volumes/EVO/kata/kata-site/`         | `gannonh/kata-site`                                       |
| `/Volumes/EVO/kata/GSD-Pi/`            | Reference implementation for CLI (not our repo)           |
| `/Volumes/EVO/kata/pi-mono/`           | Upstream pi packages (not our repo, consumed as npm deps) |

### Problems

- Growing overlap in types, auth, config, agent execution, and skills across repos
- No shared packages — duplicated patterns
- Independent release cycles with no coordination
- kata-cloud-agents locked to Claude SDK; need multi-provider support
- kata-symphony spawns Codex via subprocess; could use the same agent engine
- kata-orchestrator's desktop app abandoned; only skills are valuable
- kata-marketplace and kata-skills are distribution repos that build from orchestrator — awkward split

---

## Target State

One monorepo (`gannonh/kata`) with shared packages and multiple apps:

```
kata/
├── packages/
│   ├── core/                  ← exists (shared types, domain models)
│   ├── shared/                ← exists (auth, config, sessions, sources, MCP, channels, daemon)
│   ├── ui/                    ← exists (React chat/markdown/code components)
│   ├── mermaid/               ← exists (Mermaid rendering)
│   ├── skills/                ← extracted from kata-orchestrator
│   └── context/               ← future: rebuilt context system
│
├── apps/
│   ├── cli/                   ← NEW: coding agent CLI (pi-coding-agent wrapper)
│   ├── desktop/               ← renamed from apps/electron/
│   ├── symphony/              ← imported from kata-symphony
│   ├── site/                  ← future: marketing site (Astro, currently separate Vercel project)
│   ├── docs/                  ← future: Mintlify docs site
│   ├── viewer/                ← exists (session transcript viewer)
│   └── online-docs/           ← exists (documentation site)
```

Separate repos that remain independent (distribution targets):

- `kata-marketplace` — Claude Code plugin dist (builds from monorepo source)
- `kata-skills` — skills.sh package dist (builds from monorepo source)

Future additions (not in this plan):

- `apps/cloud/` — containerized cloud agents with web API
- `apps/docs/` — Mintlify documentation site
- Swap Claude SDK → pi-ai + pi-agent-core in `packages/shared`

---

## Phase 1: Monorepo Foundation

**Goal**: Rename and restructure kata-cloud-agents as the monorepo.

**Risk**: Low. Renaming and light restructuring only.

### Steps

1. **Rename the GitHub repo**: `gannonh/kata-cloud-agents` → `gannonh/kata`
   - The name `kata` is not taken (orchestrator already lives at `kata-orchestrator`)
   - GitHub redirects `gannonh/kata-cloud-agents` URLs automatically
   - Existing clones keep working via redirect

2. **Rename `apps/electron/` → `apps/desktop/`**
   - Update any scripts that hardcode `apps/electron`
   - Update package name if desired: `@craft-agent/electron` → `@kata/desktop`

3. **Update root `package.json`**
   - `"name"`: `"kata-agents"` → `"kata"`
   - Update `"description"`, `"repository"`, `"homepage"`, `"bugs"` URLs

4. **Update branding references**
   - README.md — new repo name, updated project description
   - References to "Craft Agents" in code/docs → "Kata"

5. **Delete obsolete repos**
   - Delete `gannonh/kata-agents` (obsolete, replaced by kata-cloud-agents)
   - Delete `gannonh/kata-cloud` (obsolete)

6. **Update git remote locally**

   ```bash
   git remote set-url origin git@github.com:gannonh/kata.git
   ```

---

## Phase 2: Add the CLI

**Goal**: Working CLI coding agent in `apps/cli/`, consuming `@mariozechner/pi-coding-agent` as an npm dependency.

**Risk**: Low. New code only, no changes to existing packages.

**Approach**: Copy GSD-Pi (`/Volumes/EVO/kata/GSD-Pi/`) into `apps/cli/` and rebrand.

### Steps

1. **Copy GSD-Pi source into `apps/cli/`**

   ```
   apps/cli/
   ├── package.json
   ├── tsconfig.json
   ├── pkg/
   │   └── package.json          ← piConfig: { "name": "kata", "configDir": ".kata" }
   ├── src/
   │   ├── loader.ts             ← rebrand gsd → kata
   │   ├── cli.ts                ← rebrand, adjust defaults
   │   ├── app-paths.ts          ← ~/.kata/ paths
   │   ├── resource-loader.ts    ← sync to ~/.kata/agent/
   │   └── resources/
   │       ├── extensions/       ← start with subset of GSD extensions
   │       ├── agents/
   │       └── skills/
   └── scripts/
       └── postinstall.js        ← branded install banner
   ```

2. **Rebrand**
   - Find-replace: `gsd` → `kata`, `GSD` → `Kata`, `.gsd` → `.kata`
   - Update `pkg/package.json`: `piConfig.name` → `"kata"`, `piConfig.configDir` → `".kata"`
   - Update `loader.ts`: process title, banner, env var names (`KATA_*` instead of `GSD_*`)
   - Update `cli.ts`: default model preferences, startup config

3. **Trim extensions**
   - Keep: `subagent/`, `slash-commands/`, `search-the-web/`, `context7/`
   - Evaluate: `browser-tools/` (pulls Playwright), `bg-shell/`, `mac-tools/`
   - Remove: `gsd/` (GSD-specific branding extension)
   - Remove or replace: `ask-user-questions.ts`, `get-secrets-from-user.ts` (GSD-specific UX)
   - Update bundled extension paths list in `loader.ts` to match

4. **Handle tsconfig**
   - CLI needs `"moduleResolution": "NodeNext"` (pi-coding-agent is Node ESM)
   - Do NOT extend root tsconfig (which uses `"bundler"`)
   - Copy GSD's tsconfig as-is — it already has the right settings

5. **Install and build**

   ```bash
   bun install                    # resolves @mariozechner/pi-coding-agent
   cd apps/cli && npx tsc         # compile
   node dist/loader.js            # run
   ```

6. **Add scripts to root package.json**

   ```json
   "cli:build": "cd apps/cli && npx tsc",
   "cli:start": "cd apps/cli && node dist/loader.js"
   ```

### Potential issues

- **bun vs npm**: GSD uses npm. The monorepo uses bun. Drop GSD's `package-lock.json` and let bun resolve. pi-coding-agent is a standard npm package — should work fine.
- **Node version**: GSD and pi-coding-agent require Node >= 20.6.0. The monorepo requires >= 18. Bump root `engines` to >= 20.6.0.
- **Theme assets**: GSD's build copies theme files from `node_modules/@mariozechner/pi-coding-agent/dist/` into `pkg/dist/`. The `copy-themes` script needs the path to resolve correctly under bun's `node_modules` layout.

---

## Phase 3: Import Skills from Kata Orchestrator

**Goal**: Bring the orchestrator's agent skills into the monorepo as a shared package. Update `kata-marketplace` and `kata-skills` dist repos to build from monorepo source.

**Risk**: Low. Skills are markdown + light TS files with no complex dependencies.

### Steps

1. **Create `packages/skills/`**

   ```
   packages/skills/
   ├── package.json              ← "@kata/skills"
   ├── kata-add-issue/
   ├── kata-add-milestone/
   ├── kata-brainstorm/
   ├── kata-execute-phase/
   ├── kata-plan-phase/
   ├── ... (all kata-* skill directories)
   └── _shared/                  ← shared skill utilities
   ```

2. **Copy from kata-orchestrator**
   - Copy `/Volumes/EVO/kata/kata-orchestrator/skills/` contents into `packages/skills/`
   - Do NOT copy `app/`, `dev/`, `bin/`, `tests/`, `dist/` — abandoned desktop app and build system

3. **Wire skills into the CLI**
   - Update `apps/cli/src/resource-loader.ts` to sync skills from `packages/skills/` into `~/.kata/agent/skills/`
   - Alternatively, copy from `packages/skills/` into `apps/cli/src/resources/skills/` at build time

4. **Update distribution repos**
   - `kata-marketplace`: update build scripts to pull plugin source from monorepo
   - `kata-skills`: update build scripts to pull skills from monorepo
   - These repos stay independent as distribution targets, but source of truth moves to the monorepo

5. **Migrate relevant tests**
   - Copy skill-specific tests from `kata-orchestrator/tests/skills/` into `packages/skills/tests/`
   - Adapt test runner (kata-orchestrator uses Node's built-in test runner; monorepo uses bun test)

6. **Archive kata-orchestrator**
   - Update README: "Skills have moved to [gannonh/kata](https://github.com/gannonh/kata). This repo is archived."
   - Archive via GitHub settings (read-only, stars and forks preserved)

---

## Phase 4: Import Symphony

**Goal**: Bring kata-symphony's orchestration service into the monorepo.

**Risk**: Medium. Symphony uses pnpm and vitest; needs adaptation to bun workspace.

### Steps

1. **Create `packages/symphony-core/`**
   - Extract domain models, workflow engine, validation, and config from `kata-symphony/src/`
   - Reusable pieces: Linear issue models, workflow templates, orchestration logic

2. **Create `apps/symphony/`**
   - The service runner: `main.ts`, `orchestrator/`, `execution/`, `tracker/`
   - Bootstrap and observability

3. **Adapt dependencies**
   - Runtime deps are light: `liquidjs`, `yaml`
   - Drop `pnpm-lock.yaml`, let bun resolve
   - Adapt vitest config or migrate tests to bun test

4. **Archive kata-symphony**
   - Update README pointing to monorepo, then archive
   - 0 stars, 0 forks — low impact

---

## Phase 5: Swap Agent Engine (Future)

**Goal**: Replace `@anthropic-ai/claude-agent-sdk` with `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core` across the monorepo.

**Risk**: High. CraftAgent is 3000+ lines tightly coupled to the Claude SDK.

**Not detailed here** — separate planning effort once Phases 1-4 are stable.

### High-level approach

1. Add `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` as dependencies to `packages/shared`
2. Build new agent implementation alongside `craft-agent.ts` using pi's `Agent` class
3. Map pi's event model to existing `AgentEvent` type so desktop UI doesn't need immediate changes
4. Feature-flag between old (Claude SDK) and new (pi) engines
5. Validate with desktop app and Symphony
6. Remove Claude SDK dependency
7. Replace Symphony's Codex subprocess spawning with pi-agent-core's Agent class

### What this unlocks

- Multi-provider support (OpenAI, Google, Mistral, Bedrock, etc.) across all apps
- Shared agent engine between CLI, desktop, Symphony, and future cloud agents
- Upstream improvements from pi-mono via npm updates
- Foundation for `apps/cloud/` — containerized agents using pi-agent-core headlessly

---

## Repo Disposition Summary

| GitHub repo         | Action                                             | When    |
| ------------------- | -------------------------------------------------- | ------- |
| `kata-cloud-agents` | Rename → `kata`                                    | Phase 1 |
| `kata-agents`       | Delete                                             | Phase 1 |
| `kata-cloud`        | Delete                                             | Phase 1 |
| `kata-orchestrator` | Extract skills → archive                           | Phase 3 |
| `kata-symphony`     | Import → archive                                   | Phase 4 |
| `kata-marketplace`  | Keep independent (dist repo, builds from monorepo) | Ongoing |
| `kata-skills`       | Keep independent (dist repo, builds from monorepo) | Ongoing |
| `kata-site`         | Keep independent (Vercel deploy from its own repo) | Future  |
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
| Distribution repos      | kata-marketplace and kata-skills stay independent | They're dist targets for different ecosystems (Claude Code, skills.sh) |
| Old repo handling       | Delete obsolete, archive after extraction         | Stars/forks preserved on archive; clean break for obsolete             |
| Agent engine swap       | Deferred to Phase 5                               | Get monorepo structure right first; engine swap is high-risk           |
| Git history for imports | Clean copy, not subtree                           | Simpler; low-star repos don't need preserved history                   |
