# Radical Feature Proposals: Final Consolidated Report

## Context

Seven paradigm-shifting feature ideas were proposed for Kata Agents, each grounded in the codebase architecture (session management, event processing, MCP/source integration, skills, labels, git services, headless runner). Each proposal was challenged on novelty, feasibility, and scoping. This report reflects the post-debate consensus, incorporating critiques that changed recommendations.

---

## Final Rankings

### #1. Reactive Workspace Agents (Consensus: Build First)

**Vision:** Workspace-level agents triggered by events: git push, CI failure, PR comment, file change. Users define reactive rules. Agents use the same session infrastructure but operate autonomously.

**Why both sides agree this is strongest:** Genuinely novel in the desktop AI tools space. GitHub Copilot Agents handles PR review but is limited to GitHub-hosted events. A general-purpose event-driven agent that responds to any workspace event through existing MCP sources is differentiated. Every competitor is pull-based.

**Architecture fit (validated):** HeadlessRunner handles non-interactive execution. GitWatcher (`apps/electron/src/main/lib/git-watcher.ts`) watches for branch changes. ConfigWatcher provides file-watching patterns. SessionManager spawns isolated Bun subprocesses. The missing piece is a lightweight event bus in the main process that routes events to rules.

**Post-debate scoping (phased):**
- Phase 1 (3 months): Git-event triggers only (push, branch change, PR opened). Safe mode only (read-only analysis, no writes).
- Phase 2: File-change triggers with aggressive debouncing and source filtering.
- Phase 3: External event triggers via MCP sources.

**Risks with agreed mitigations:**
- *Infinite loops:* Agent-initiated file changes must not re-trigger the same rule. Source tracking on all filesystem writes.
- *Cost:* Per-rule cooldown periods, daily token budget per workspace, max concurrent background sessions.
- *Trust:* Default to safe mode. Each reactive execution creates a visible session with full audit trail. Users opt into write-capable reactions incrementally.
- *Noisy events:* Debouncing is essential. A file watcher during `npm install` could fire hundreds of events. Smart filtering (ignore node_modules, build output) required.

**Verdict:** Build this. Phase 1 is achievable in 3 months.

---

### #2. Session Forking (Rescoped: Fork-and-Compare)

**Vision (original):** Full git-style branching for conversations with tree persistence, side-by-side comparison, and merge.

**Challenger's critique (accepted):** The original scope underestimates the architecture impact. Sessions are linear append-only JSONL. The EventProcessor assumes linear message arrays. `ManagedSession` tracks `messages: Message[]` as a flat array. Every consumer of session data assumes linearity. Tree persistence is a rewrite, not an extension. Additionally, each fork needs a fresh SDK session (`sdkSessionId` maintains API conversation continuity), requiring full message history replay at the fork point. Merging is a tarpit: resolving AI-generated file conflicts across divergent forks recreates the worst part of git.

**Rescoped vision:** Fork-and-compare without merge. Copy JSONL up to the fork point into a new session. Run both branches independently. Visually compare results in a split view. User chooses one and discards the other. No tree persistence, no merge semantics.

**Scope (rescoped):** 2-4 weeks. Copy JSONL is trivial. Split-view comparison is moderate UI work.

**Why this is still valuable:** Developers trying two approaches to a problem (e.g., "refactor auth with a class hierarchy" vs. "refactor auth with composable functions") can run both and compare outcomes. No other AI tool offers this.

**Verdict:** Build as a lightweight feature after Reactive Agents. The de-scoped version delivers most of the value.

---

### #3. Agent Memory / Session Summaries (Merged from proposals #3 and #6)

**Vision (original):** Two separate proposals: (a) a persistent knowledge graph across sessions and (b) an artifact extraction pipeline.

**Challenger's critique (accepted on both counts):**

On the memory graph: Entity extraction from unstructured conversations with production-quality accuracy is an open research problem. "The auth module" could refer to `packages/shared/src/auth/`, `apps/electron/src/main/auth-handlers.ts`, or the concept of authentication. Disambiguating requires coreference resolution that LLMs do inconsistently. Staleness is hard: the graph says "UserService handles auth" but that was refactored 3 weeks ago, poisoning every new session. A graph DB in Electron adds binary size and memory impact. This is a 1-2 year research project, not a 4-6 month feature.

On the artifact pipeline: Overlaps with the memory graph. Two parallel knowledge systems that need to stay in sync is worse than one. The ADR/changelog export is a nice-to-have that works better as a skill than a core feature.

**Merged, de-scoped vision:** Session summaries. When a session completes, generate a structured summary (entities mentioned, files modified, decisions made, patterns discovered) and store it as a JSON sidecar alongside the JSONL. Make summaries searchable with full-text search. The agent can query past summaries when answering new questions. Export-to-ADR becomes a skill, not a core feature.

**Scope (rescoped):** 1-2 months. LLM-powered summary generation per session, JSON storage, search interface, agent tool for querying summaries.

**Why this matters:** 60% of the memory graph's value (cross-session recall) with 10% of the complexity. Validates whether users actually benefit from cross-session knowledge before investing in graph infrastructure. If summaries prove valuable, the full graph becomes a data-informed investment rather than a speculative bet.

**Risks:**
- Summary quality varies. Let users approve/edit summaries.
- API cost: one summarization call per completed session. Bounded and predictable.
- Staleness still exists but is less dangerous: a bad summary is context, not authoritative data. The agent can cross-reference summaries against actual file state.

**Verdict:** Build after fork-and-compare. Short scope, validates the Kata Context thesis.

---

### #4. Workspace-as-a-Protocol (Rescoped: Export/Import)

**Vision (original):** Portable, publishable workspace configurations distributed via a registry.

**Challenger's critique (accepted):** The concept is well-trodden (VS Code Settings Sync, devcontainers, dotfiles). The AI-specific twist (MCP configs, skills, permissions) adds moderate novelty. The real problems are security (stdio MCP configs can execute arbitrary commands; permission configs can grant allow-all mode; this is a supply chain attack vector), credential templating (workspace-specific credential IDs need to become install-time prompts), and cold-start (who publishes the first 50 workspaces?).

**Rescoped vision:** Workspace export/import as local files. A tarball of config.json + sources/ + skills/ + permissions.json with credential placeholders. Teams share via existing channels (git repos, Slack). No registry, no governance, no marketplace.

**Scope (rescoped):** 2-4 weeks.

**Why this is still valuable:** Eliminates the biggest barrier to team adoption (manual environment setup) without the infrastructure investment of a registry. If organic sharing takes off, build the registry on top.

**Security mitigation:** On import, display a preview of all MCP configs, permission settings, and stdio commands. Require user confirmation before installing. Flag any `allow-all` permissions or stdio commands with warnings.

**Verdict:** Build as a lightweight feature. Low effort, moderate value for teams.

---

### #5. Curated Skill Library (Rescoped from Skill Marketplace)

**Vision (original):** Public marketplace with sandboxed execution, community publishing, ratings, security audits.

**Challenger's critique (accepted):** Cross-platform sandboxing (macOS App Sandbox, Windows isolation, Linux namespaces) for arbitrary scripts is a substantial undertaking. Cold-start problem is real. Maintenance burden is unbounded: community skills break when APIs change. VS Code's extension marketplace took years to build and still has security incidents.

**Rescoped vision:** Kata team publishes 20-30 curated, high-quality skills covering common use cases (PR review, test generation, documentation, migration, debugging). Shipped with the app or installable via `kata skill install @kata/pr-review` backed by a git repo. No community publishing, no sandboxing, no ratings.

**Scope (rescoped):** 1 month for infrastructure, ongoing for skill creation.

**Why this matters:** Skills demonstrate Kata's extensibility without the platform overhead. If the ecosystem grows organically (users sharing skills via git), the marketplace investment becomes data-informed.

**Verdict:** Build the distribution mechanism. Invest in skill quality, not marketplace infrastructure.

---

### Deferred: Live Collaborative Sessions

**Vision:** Multi-human real-time session participation.

**Why deferred (consensus):** The architecture is fundamentally single-user at every layer: Electron IPC is local-only, Jotai atoms are in-browser state, the permission system has a single `PendingPermission` per session, JSONL doesn't support concurrent writes. Multiplayer requires a relay server, operational transforms or CRDTs, and a rethought permission model. This is a startup-within-a-startup. Figma spent years building their multiplayer engine.

**Viable subset:** Live session viewing (read-only) via SSE. One active user, multiple observers. Useful for pair programming and demos without multiplayer complexity. The `sharedUrl` / `sharedId` fields in session config already support sharing.

---

## Priority Roadmap

| Phase | Feature | Scope | Key Deliverable |
|-------|---------|-------|-----------------|
| 1 | Reactive Workspace Agents (Phase 1) | 3 months | Git-event triggers, safe mode, event bus |
| 2 | Session Fork-and-Compare | 2-4 weeks | JSONL copy, split-view comparison |
| 3 | Session Summaries | 1-2 months | JSON sidecar, search, agent query tool |
| 4 | Workspace Export/Import | 2-4 weeks | Tarball export, credential templates, import preview |
| 5 | Curated Skill Library | 1 month + ongoing | Distribution mechanism, 20-30 skills |
| Defer | Live Collaborative Sessions | - | Read-only live viewing only |

## Key Insight

The debate sharpened every proposal. The original set had two features at 4-6 month scope that were open research problems (memory graph, collaborative sessions) and two that were premature platform plays (skill marketplace, workspace registry). After challenge, the portfolio shifted from 5 multi-month bets to 5 scoped deliverables. The total estimated effort dropped from ~24 months to ~7 months while preserving the core thesis: **make Kata proactive (reactive agents), make it remember (session summaries), and make it shareable (workspace export).**

The single biggest opportunity remains Reactive Workspace Agents. It redefines the interaction model from pull to push, uses existing infrastructure (headless runner, git watcher, MCP sources), and has no equivalent in the competitive landscape.
