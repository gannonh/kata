# High-Value Feature Report: Kata Agents

Final consolidated report after 3 rounds of adversarial debate between Explorer and Challenger, grounded in codebase architecture analysis. Both sides reached consensus on rankings, scoping, and implementation approach.

---

## Workflow Loop: Templates + Handoff

A key insight from the debate: Session Templates (#1) and Context Health/Handoff (#4) create a reinforcing workflow loop. A handoff document can include a template for the follow-up session, and templates can reference handoff documents as initial context. This means:

- User works in a long session until context fills up
- Handoff tool generates a structured summary + a template for continuation
- User launches the template, which creates a new session pre-loaded with handoff context
- The new session picks up where the old one left off with full source/permission/model configuration

This loop is more valuable than either feature alone. Implementation should keep this connection in mind.

---

## Priority 1: Session Templates and Reusable Workflows

**What:** Save session configurations as launchable templates. A template captures: system prompt additions, enabled source slugs, permission mode, working directory, model, thinking level, labels, and an optional initial message. Users launch templates via one-click or slash command to create a pre-configured session.

**Why this is #1:** The infrastructure is ready. `ManagedSession` already stores every field a template needs. Storage at `~/.kata-agents/templates/` (app-level). The `ConfigWatcher` can watch that directory for hot-reloading. No competitor offers session-level templates with integrated source/permission/model presets.

**Scope:** 1-1.5 weeks.

**Implementation path:**
- Template storage: JSON files, one per template, at `~/.kata-agents/templates/` (app-level)
- "Save as Template" action on existing sessions (serialize session header subset)
- Template launcher integrated into new session creation flow
- Source slug validation at launch time: warn on missing sources, don't hard-fail
- ConfigWatcher integration for live template updates
- Version field in template schema from day one

**Risks:**
- Template portability: source slugs are workspace-scoped. Validation at launch handles this gracefully (warning, not failure).
- Schema evolution: template format needs versioning as session config evolves.
- Feature distinction vs. Skills: Skills configure agent behavior via prompts. Templates configure the session environment. Clear UX separation needed.

**Debate consensus:** Both sides agree this is the strongest proposal. Initial disagreement on scope (per-workspace vs. app-level) resolved in favor of app-level storage. Challenger withdrew per-workspace-first objection after Explorer cited the existing config pattern.

---

## Priority 2: Session Orchestration (Phase 1 Only)

**What:** Allow a parent session to spawn and monitor a single child session. Child results are injected back into the parent's conversation. The UI shows the parent-child relationship in the session list.

**Why:** Highest competitive differentiation. No existing tool (Claude Code CLI, Cursor, Windsurf) offers visual multi-agent orchestration in a desktop UI. Kata Orchestrator operates at the CLI layer; Kata Agents orchestration operates at the visual layer (users watch child sessions work in real-time, approve permissions, review results in parent).

**Scope:** 2 weeks for Phase 1. Phase 2 (multi-child, parallel execution, session tree UI) is a separate decision point after Phase 1 ships. Do not pre-commit to Phase 2 scope.

**Implementation path (Phase 1):**
- Add `parentSessionId` field to `ManagedSession` (additive)
- Coordinator session programmatically creates a child via `SessionManager`
- Child results injected into parent as a message using the existing "faked user message" pattern (precedent: auth retry flow in sessions.ts)
- IPC broadcasts already deliver session events to the renderer; extend for parent-child grouping
- Throttling: coordinator manages child spawning to avoid API rate limits

**Risks:**
- No inter-session event bus exists. SessionManager treats sessions as fully isolated. Building coordinator-to-child communication is the core technical challenge.
- Resource consumption: each child is a Bun subprocess + API calls. Rate limits on standard Anthropic plans constrain concurrency (2 concurrent sessions is fine, 5 will throttle).
- ManagedSession already has 40+ fields. Adding orchestration state needs careful design.

**Debate consensus:** Challenger initially flagged Kata Orchestrator overlap and complexity. Explorer argued visual orchestration is a fundamentally different product surface. Challenger accepted after reviewing the distinct use cases. Both sides agree on phased approach: Phase 1 validates the concept, Phase 2 is contingent on Phase 1 learnings. The "faked user message" pattern for result injection is a feasible precedent.

**Open question resolved:** Kata Orchestrator (CLI framework for terminal agents) and Kata Agents orchestration (visual desktop UI for monitoring/approving child sessions) serve different audiences and use cases. No product overlap.

---

## Priority 3: Enhanced File Preview

**What:** Upgrade the existing file preview (right sidebar) to a tabbed file workspace. Files affected by agent operations appear with syntax highlighting via Shiki, diff viewing via ShikiDiffViewer, and file tree navigation. Read-only; no inline editing.

**Why:** Eliminates context-switching to an external editor for reviewing agent work. The component foundation exists: `ShikiCodeViewer`, `ShikiDiffViewer`, `FileViewer`, and `WATCH_SESSION_FILES` IPC channel. This is primarily a UI integration effort.

**Scope:** 1 week.

**Implementation path:**
- Tab management for multiple open files in the right sidebar
- Upgrade FileViewer from plain text to Shiki-highlighted rendering
- Diff view toggle showing agent modifications (before/after)
- File tree navigation for session-modified files
- Integration with git diff for uncommitted changes display

**Risks:**
- Performance: large files with Shiki highlighting are expensive. Need lazy rendering or file size limits.
- Scope creep: inline editing was explicitly removed. Adding it later is a separate feature with different competitive implications (competes with Cursor as an editor).

**Debate consensus:** Both sides agree on read-only scope. Inline editing creates a mini-IDE (scope explosion: undo/redo, conflict detection, permission mode integration). The review-focused preview is the right scope and ships faster.

---

## Priority 4: Context Health and Handoff

**What:** Surface context window usage in the UI (percentage bar showing tokens consumed vs. context window size). Proactive notification at 80%+ usage. User-triggered handoff document generation: a structured summary of decisions made, files changed, errors encountered, and pending work. The handoff document is loadable as initial context for a new session (connects to Templates via the workflow loop above).

**Why:** Long sessions hit context limits silently. The SDK's compaction (/compact) is opaque to users. The app already tracks `contextTokens` and `contextWindow` on `ManagedSession`. Surfacing this data and providing a structured recovery path addresses a universal pain point. No competitor surfaces context health with this level of user control.

**Scope:** 1-1.5 weeks.

**Implementation path:**
- Context health indicator: progress bar in session header showing `contextTokens / contextWindow` percentage
- Threshold notification: toast/badge when context usage exceeds 80%
- Handoff tool: session-scoped tool that reads the session's tool history (file paths from `toolInput`, command results, token usage, todoState) and generates a structured markdown document
- Handoff document stored in session directory, loadable by "Continue in new session" action
- "Continue in new session": creates a new session with the handoff document as initial context; optionally generates a template for the follow-up session

**Risks:**
- Information loss: automated summarization drops nuance. The handoff document should be user-reviewable before the new session starts.
- SDK compaction overlap: /compact handles internal context compression. Handoff complements it by providing cross-session continuity, not replacing it.
- A skill alone can't access session metadata (toolInput history, token usage, todoState). A session-scoped tool is the right implementation.

**Debate consensus:** Challenger initially argued this could be a skill. Explorer demonstrated that session metadata access requires a session-scoped tool. Challenger conceded and further refined the proposal: handoff documents should be loadable as context, connecting to Session Templates for a workflow loop.

---

## Priority 5: Session Search

**What:** Full-text search across all sessions in a workspace, plus structured field extraction. Search results show matching messages in context with session metadata. Filter by labels, status, date range.

**Why:** As session counts grow, finding past conversations is impossible. JSONL storage format makes indexing straightforward (each line is parseable JSON). Tool messages contain structured data (file paths in `toolInput`, command strings in bash tool calls) that can be extracted without ML.

**Scope:** 1 week.

**Implementation path:**
- JSONL indexing: background scan of session.jsonl files. Read headers (8KB) for metadata, scan message lines for content
- Structured extraction: parse `toolName` and `toolInput` fields for file paths, bash commands, error messages (already structured in JSONL format)
- Search UI: command palette (Cmd+K) or dedicated search panel. Results grouped by session with message-level matches
- Incremental indexing: only re-index sessions modified since last index run

**Risks:**
- Search quality: substring matching may be insufficient for larger corpora. Tokenized search with relevance ranking for v2.
- Index size: incremental indexing and lazy loading mitigate growth.

**Debate consensus:** The original "Knowledge Graph" framing was dropped. Challenger correctly identified it as two features under one label. Entity extraction from unstructured conversation text (decisions, reasoning) requires ML infrastructure. Structured field extraction from tool messages (file paths, commands) is the practical scope that ships in a week.

---

## Priority 6: Session Duplication with Context

**What:** Duplicate a session at any point, creating a full copy with a fresh SDK session. The new session starts with injected context from the original (via `getRecoveryMessages`).

**Why:** Users want to try alternative approaches without losing the current thread. Full duplication avoids the storage complexity of structural sharing.

**Scope:** 3-5 days for core duplication. Comparison view is a separate v2 addition.

**Implementation path:**
- "Duplicate" action on session context menu
- Copy JSONL file, assign new session ID, clear sdkSessionId
- New SDK session initialized with injected context (last N user/assistant messages via getRecoveryMessages pattern)

**Risks:**
- Context injection via getRecoveryMessages is lossy. The duplicate session won't have full SDK history (compaction state, tool results).
- Storage cost: full JSONL copies. Acceptable for individual sessions.

**Debate consensus:** The original "Session Branching" proposal was simplified. Challenger demonstrated that JSONL structural sharing doesn't exist (flat format: header + messages), SDK session ID is 1:1 (branches can't resume), and side-by-side comparison requires duplicating EventProcessor. Explorer conceded and reframed as full duplication. Both sides agree this is the pragmatic answer.

---

## Dropped: Workspace Dashboard

**Original proposal:** Full workspace dashboard with activity timeline, cost trends, file modification tracking, session health indicators.

**Why dropped:** Poor value/complexity ratio. File modification tracking requires entity extraction from JSONL (same unsolved problem as knowledge graph). Time-series for trends requires new storage infrastructure.

**Recommendation:** Move the minimal version (three-number stats header: total sessions, total cost, active count) to the quick-wins list.

---

## Implementation Sequence

Recommended build order based on value, feasibility, and dependencies:

| Order | Feature | Scope | Dependencies |
|-------|---------|-------|-------------|
| 1 | Session Templates | 1-1.5 weeks | None |
| 2 | Enhanced File Preview | 1 week | None (parallel with #1) |
| 3 | Session Search | 1 week | None |
| 4 | Context Health and Handoff | 1-1.5 weeks | Benefits from Templates (#1) for workflow loop |
| 5 | Session Duplication | 3-5 days | None |
| 6 | Session Orchestration Phase 1 | 2 weeks | Benefits from Templates (#1) |

**Total estimated effort:** 7.5-9 weeks across all features.

**Parallelization:** Items 1+2 can run simultaneously (independent work streams). Items 3, 4, 5 are sequential but small. Item 6 is a separate workstream best started after Templates ships.

**Key dependency:** Context Health/Handoff (#4) should be built after Templates (#1) to implement the workflow loop (handoff generates a template for continuation sessions).
